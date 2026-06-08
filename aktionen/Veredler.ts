#!/usr/bin/env bun
/**
 * Veredler.ts — der Vernetzungs-Lauf (B3c).
 *
 * Zweiter, leichter Lauf NACH dem Bibliothekar: Er vernetzt bestehende
 * Wiki-Artikel (Querverweise + Tags) — er destilliert NICHT und schreibt KEINE
 * Inhalte um. Das einzige Schreibwerkzeug, das er benutzt, ist
 * `artikel_vernetzen`, das nur Verwandt-Verweise und die Tags-Zeile setzt und
 * Kurzfassung/Inhalt Zeichen für Zeichen erhält. So bekommen auch
 * handgeschriebene Wiki-Notizen automatisch Querverweise, ohne dass ihr Inhalt
 * angetastet wird (Pendant zum Konsolidierungs-Agenten in Lokyy Brain).
 *
 * Wie der Bibliothekar: headless Agent über lokyy-mcp (stdio), OpenAI-kompatibler
 * Endpoint fürs Denken (BASE_URL/API_KEY/MODELL), git hält die Provenance.
 * Mit FORGEJO_* entsteht ein PR (Auto-Merge im auto-Modus); ohne reiner Lokal-Lauf.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { saeubern } from "../src/gitintegration.ts";

export interface VeredlerKonfiguration {
  repoPfad: string;
  baseUrl: string;
  apiKey: string;
  modell: string;
  maxSchritte: number;
  branch?: string;
  forgejo?: { url: string; repo: string; token: string };
  mergeModus?: "auto" | "manuell";
  log?: (zeile: string) => void;
}

const JOB_ANWEISUNG = `Du bist der Veredler dieser Wissensbasis.
Du VERNETZT bestehende Artikel — du destillierst nicht und schreibst nie Inhalte um.
Vorgehen, ausschließlich über die Werkzeuge:
1. Lies das Inhaltsverzeichnis: artikel_lesen mit slug "INDEX".
2. Lies die Artikel (artikel_lesen) und erkenne inhaltliche Bezüge zwischen ihnen.
3. Setze mit artikel_vernetzen pro Artikel die Verwandt-Verweise (nur auf
   existierende Artikel-Slugs) und 1-5 treffende Tags (einzelne Wörter).
   Denke Verwandtschaft beidseitig: passt A zu B, vernetze auch B zu A.
4. artikel_vernetzen ändert NUR Verweise und Tags — Kurzfassung und Inhalt
   bleiben unangetastet. Erfinde keine Verweise auf nicht existierende Artikel.
Schließe mit einer Bilanz in 2-4 Zeilen ab (was vernetzt, was getaggt).
Gibt es nichts zu vernetzen (z. B. nur ein einziger Artikel): Antworte exakt
mit NICHTS_ZU_TUN und sonst nichts.`;

function git(repo: string, args: string[]): string {
  return execFileSync("git", ["-C", repo, ...args], {
    encoding: "utf8",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
}

type Nachricht = Record<string, unknown>;

export async function veredlerLauf(cfg: VeredlerKonfiguration): Promise<{
  status: "nichts-zu-tun" | "gearbeitet" | "pr-erstellt" | "pr-gemergt";
  bilanz: string;
  commits: number;
  prUrl?: string;
  prNummer?: number;
  gemergt?: boolean;
}> {
  const log = cfg.log ?? ((z) => console.error(z));
  if (!cfg.apiKey || cfg.apiKey.length < 16) {
    throw new Error("API_KEY fehlt oder ist zu kurz — der Veredler startet nicht ohne Anmeldung beim Modell-Endpoint.");
  }

  const istGit = existsSync(join(cfg.repoPfad, ".git"));
  let startCommit = "";
  if (istGit && cfg.branch) {
    git(cfg.repoPfad, ["checkout", "-B", cfg.branch]);
    log(`Arbeitszweig: ${cfg.branch}`);
  }
  if (istGit) startCommit = git(cfg.repoPfad, ["rev-parse", "HEAD"]).trim();

  const client = new Client({ name: "lokyy-veredler", version: "1.0.0" });
  await client.connect(
    new StdioClientTransport({
      command: "bun",
      // Kein --autonom: der Veredler liest nur Wiki-Artikel (destilliertes, nicht
      // personenbezogenes Wissen) und rührt RAW/Blobs nie an.
      args: [join(import.meta.dir, "..", "src", "index.ts"), "--repo", cfg.repoPfad, ...(istGit ? ["--git"] : [])],
    }),
  );

  try {
    const werkzeug = async (name: string, args: Record<string, unknown> = {}) => {
      const res = await client.callTool({ name, arguments: args });
      return (res.content as { text: string }[]).map((c) => c.text).join("\n");
    };
    const mcpTools = (await client.listTools()).tools;
    const tools = mcpTools.map((t) => ({
      type: "function" as const,
      function: { name: t.name, description: t.description ?? "", parameters: t.inputSchema },
    }));

    const index = await werkzeug("artikel_lesen", { slug: "INDEX" }).catch(() => "(noch kein Index)");
    const nachrichten: Nachricht[] = [
      { role: "system", content: JOB_ANWEISUNG },
      { role: "user", content: `Inhaltsverzeichnis der Wissensbasis:\n\n${index}\n\nVernetze die Artikel.` },
    ];

    let bilanz = "";
    for (let schritt = 1; schritt <= cfg.maxSchritte; schritt++) {
      const antwort = await fetch(`${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify({ model: cfg.modell, messages: nachrichten, tools, tool_choice: "auto" }),
      });
      if (!antwort.ok) {
        throw new Error(saeubern(`Modell-Endpoint antwortet ${antwort.status}: ${(await antwort.text()).slice(0, 500)}`));
      }
      const daten = (await antwort.json()) as { choices?: { message: Nachricht & { tool_calls?: { id: string; function: { name: string; arguments: string } }[]; content?: string } }[] };
      if (!daten.choices?.[0]?.message) {
        throw new Error(saeubern(`Modell-Endpoint lieferte keine Antwort-Wahl (Schritt ${schritt}): ${JSON.stringify(daten).slice(0, 500)}`));
      }
      const msg = daten.choices[0].message;
      nachrichten.push(msg);

      if (msg.tool_calls && msg.tool_calls.length > 0) {
        for (const call of msg.tool_calls) {
          log(`Werkzeug: ${call.function.name}`);
          let ergebnis: string;
          try {
            ergebnis = await werkzeug(call.function.name, JSON.parse(call.function.arguments || "{}"));
          } catch (e) {
            ergebnis = saeubern(`Werkzeug-Fehler: ${(e as Error).message}`);
          }
          nachrichten.push({ role: "tool", tool_call_id: call.id, content: ergebnis.slice(0, 8000) });
        }
        continue;
      }
      bilanz = (msg.content ?? "").trim();
      break;
    }
    if (bilanz === "") bilanz = "Schritt-Limit erreicht — Lauf beendet, Zwischenstand committet.";

    const commits = istGit
      ? Number(git(cfg.repoPfad, ["rev-list", "--count", `${startCommit}..HEAD`]).trim())
      : 0;

    if (bilanz.includes("NICHTS_ZU_TUN") && commits === 0) {
      log("Nichts zu vernetzen — gutes Ergebnis, kein PR.");
      return { status: "nichts-zu-tun", bilanz: "Nichts zu vernetzen — die Artikel sind aktuell verknüpft.", commits: 0, gemergt: false };
    }

    const report = `## Vernetzungs-Lauf des Veredlers\n\n${bilanz}\n\n*${commits} Commit(s) — nur Querverweise und Tags, kein Inhalt verändert.*`;

    if (cfg.forgejo && istGit && commits > 0 && cfg.branch) {
      git(cfg.repoPfad, ["push", "-u", "origin", cfg.branch, "--force-with-lease"]);
      const base = `${cfg.forgejo.url.replace(/\/$/, "")}/api/v1/repos/${cfg.forgejo.repo}`;
      const kopf = { "content-type": "application/json", authorization: `token ${cfg.forgejo.token}` };
      const pr = await fetch(`${base}/pulls`, {
        method: "POST",
        headers: kopf,
        body: JSON.stringify({ title: `Veredler: Vernetzung ${new Date().toISOString().slice(0, 10)}`, head: cfg.branch, base: "main", body: report }),
      });
      if (!pr.ok) throw new Error(saeubern(`PR-Erstellung fehlgeschlagen (${pr.status}): ${(await pr.text()).slice(0, 300)}`));
      const prDaten = (await pr.json()) as { html_url?: string; number?: number };
      const prUrl = prDaten.html_url;
      const prNummer = prDaten.number;
      log(`PR erstellt: ${prUrl ?? "(URL unbekannt)"}`);

      // Vernetzung ist verlustfrei (kein Inhalt geändert) — im auto-Modus mergen wir selbst.
      if ((cfg.mergeModus ?? "auto") === "auto" && prNummer !== undefined) {
        const merge = await fetch(`${base}/pulls/${prNummer}/merge`, {
          method: "POST",
          headers: kopf,
          body: JSON.stringify({ Do: "merge", delete_branch_after_merge: true }),
        });
        if (merge.ok) {
          log(`PR #${prNummer} automatisch zusammengeführt.`);
          return { status: "pr-gemergt", bilanz: report, commits, prUrl, prNummer, gemergt: true };
        }
        log(saeubern(`Auto-Merge nicht möglich (${merge.status}) — PR bleibt offen.`));
      }
      return { status: "pr-erstellt", bilanz: report, commits, prUrl, prNummer, gemergt: false };
    }

    log(`Lokal-Lauf beendet — ${commits} Commit(s).\n${report}`);
    return { status: "gearbeitet", bilanz: report, commits, gemergt: false };
  } finally {
    await client.close();
  }
}

// ── CLI-Einstieg (so ruft die Action ihn auf) ─────────────
if (import.meta.main) {
  const heute = new Date().toISOString().slice(0, 10);
  const forgejo =
    process.env.FORGEJO_URL && process.env.FORGEJO_REPO && process.env.FORGEJO_TOKEN
      ? { url: process.env.FORGEJO_URL, repo: process.env.FORGEJO_REPO, token: process.env.FORGEJO_TOKEN }
      : undefined;
  veredlerLauf({
    repoPfad: process.env.REPO_PFAD ?? ".",
    baseUrl: process.env.BASE_URL ?? "https://openrouter.ai/api/v1",
    apiKey: process.env.API_KEY ?? "",
    modell: process.env.MODELL ?? "openrouter/auto",
    maxSchritte: Number(process.env.MAX_SCHRITTE ?? 30),
    branch: `veredler/${heute}`,
    mergeModus: process.env.MERGE_MODUS === "manuell" ? "manuell" : "auto",
    forgejo,
  }).catch((e) => {
    console.error(saeubern((e as Error).message));
    process.exit(1);
  });
}
