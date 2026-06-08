#!/usr/bin/env bun
/**
 * Bibliothekar.ts — der nächtliche Lauf (B2).
 *
 * Headless Agent über den lokyy-mcp: Der Server liefert Auftrag und Werkzeuge,
 * ein OpenAI-kompatibler Endpoint liefert das Denken (BASE_URL/API_KEY/MODELL —
 * Modellwechsel ist Variablentausch, nie Umbau), git hält die Provenance.
 *
 * Modus A (Action): FORGEJO_URL/FORGEJO_REPO/FORGEJO_TOKEN gesetzt →
 *   librarian-Branch, Push, Pull Request mit dem Health-Report als Beschreibung.
 * Modus B (lokal/Test): ohne FORGEJO_* → reiner Lokal-Lauf mit Log.
 *
 * Sicherheit: Der API_KEY wandert ausschließlich in den Authorization-Header —
 * nie in Nachrichten, Logs oder PR-Texte; alle Fehlertexte laufen durch saeubern().
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { saeubern } from "../src/gitintegration.ts";

export interface LaufKonfiguration {
  repoPfad: string;
  baseUrl: string;
  apiKey: string;
  modell: string;
  maxSchritte: number;
  branch?: string; // ohne git-Repo: undefined
  forgejo?: { url: string; repo: string; token: string };
  log?: (zeile: string) => void;
}

const JOB_ANWEISUNG = `Du bist der nächtliche Bibliothekar dieser Wissensbasis.
Du arbeitest AUSSCHLIESSLICH über die bereitgestellten Werkzeuge — nie anders.
Dein Auftrag heute Nacht:
1. Destilliere alle unverarbeiteten Quellen laut Destillat-Auftrag (Quelle lesen,
   Artikel schreiben, Quelle als verarbeitet markieren). Ein Artikel = ein
   Konzept; bei kurzen Quellen ist EIN Artikel das richtige Ergebnis.
2. Prüfe danach die Struktur (gesundheits_check) und repariere nur, was die
   Betriebsanweisung dir erlaubt.
3. Schließe mit einer Bilanz in 3-6 Zeilen ab (was destilliert, was geprüft,
   was dem Besitzer zur Entscheidung bleibt) — sie wird die PR-Beschreibung.
Gibt es nichts zu destillieren UND der Check ist sauber: Antworte exakt mit
NICHTS_ZU_TUN und sonst nichts. Erfinde NIE Inhalte ohne Quellengrundlage.`;

function git(repo: string, args: string[]): string {
  return execFileSync("git", ["-C", repo, ...args], {
    encoding: "utf8",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
}

type Nachricht = Record<string, unknown>;

export async function bibliothekarLauf(cfg: LaufKonfiguration): Promise<{
  status: "nichts-zu-tun" | "gearbeitet" | "pr-erstellt";
  bilanz: string;
  commits: number;
  prUrl?: string;
}> {
  const log = cfg.log ?? ((z) => console.error(z));
  if (!cfg.apiKey || cfg.apiKey.length < 16) {
    throw new Error("API_KEY fehlt oder ist zu kurz — der Bibliothekar startet nicht ohne Anmeldung beim Modell-Endpoint.");
  }

  const istGit = existsSync(join(cfg.repoPfad, ".git"));
  let startCommit = "";
  if (istGit && cfg.branch) {
    git(cfg.repoPfad, ["checkout", "-B", cfg.branch]);
    log(`Arbeitszweig: ${cfg.branch}`);
  }
  if (istGit) startCommit = git(cfg.repoPfad, ["rev-parse", "HEAD"]).trim();

  // lokyy-mcp als stdio-Subprozess — derselbe Server, den auch Menschen nutzen.
  const client = new Client({ name: "lokyy-bibliothekar", version: "1.0.0" });
  await client.connect(
    new StdioClientTransport({
      command: "bun",
      // --autonom: harte Schranke gegen Personendaten-Leck in die Cloud (geschützte
      // Blob+Stub-Quellen werden im Nachtlauf nie entschlüsselt, nie destilliert).
      args: [join(import.meta.dir, "..", "src", "index.ts"), "--repo", cfg.repoPfad, "--autonom", ...(istGit ? ["--git"] : [])],
    }),
  );

  try {
    const lese = async (uri: string) =>
      ((await client.readResource({ uri })).contents[0] as { text: string }).text;
    const werkzeug = async (name: string, args: Record<string, unknown> = {}) => {
      const res = await client.callTool({ name, arguments: args });
      return (res.content as { text: string }[]).map((c) => c.text).join("\n");
    };

    const basis = await lese("lokyy://anweisung/basis");
    const overlay = await lese("lokyy://anweisung/overlay");
    const auftrag = await werkzeug("destillat_auftrag");
    const checkVorher = await werkzeug("gesundheits_check");

    const mcpTools = (await client.listTools()).tools;
    const tools = mcpTools.map((t) => ({
      type: "function" as const,
      function: { name: t.name, description: t.description ?? "", parameters: t.inputSchema },
    }));

    const nachrichten: Nachricht[] = [
      { role: "system", content: `${JOB_ANWEISUNG}\n\n=== BETRIEBSANWEISUNG (Basis) ===\n${basis}\n\n=== OVERLAY ===\n${overlay}` },
      { role: "user", content: `${auftrag}\n\n=== STRUKTUR-CHECK VOR DEM LAUF ===\n${checkVorher}` },
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
      const daten = (await antwort.json()) as { choices?: { message: Nachricht & { tool_calls?: { id: string; function: { name: string; arguments: string } }[]; content?: string } }[]; error?: { message?: string; code?: unknown } };
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

    const checkNachher = await werkzeug("gesundheits_check");
    const commits = istGit
      ? Number(git(cfg.repoPfad, ["rev-list", "--count", `${startCommit}..HEAD`]).trim())
      : 0;

    if (bilanz.includes("NICHTS_ZU_TUN") && commits === 0) {
      log("Nichts zu tun — gutes Ergebnis, kein PR.");
      return { status: "nichts-zu-tun", bilanz: "Nichts zu tun — alle Quellen verarbeitet, Struktur sauber.", commits: 0 };
    }

    const report =
      `## Nachtlauf des Bibliothekars\n\n${bilanz}\n\n` +
      `### Struktur-Check nach dem Lauf\n\n\`\`\`\n${checkNachher}\n\`\`\`\n\n` +
      `*${commits} Commit(s) über die lokyy-Werkzeuge — jeder einzeln nachvollziehbar.*`;

    if (cfg.forgejo && istGit && commits > 0 && cfg.branch) {
      git(cfg.repoPfad, ["push", "-u", "origin", cfg.branch, "--force-with-lease"]);
      const api = `${cfg.forgejo.url.replace(/\/$/, "")}/api/v1/repos/${cfg.forgejo.repo}/pulls`;
      const pr = await fetch(api, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `token ${cfg.forgejo.token}` },
        body: JSON.stringify({ title: `Bibliothekar: Nachtlauf ${new Date().toISOString().slice(0, 10)}`, head: cfg.branch, base: "main", body: report }),
      });
      if (!pr.ok) throw new Error(saeubern(`PR-Erstellung fehlgeschlagen (${pr.status}): ${(await pr.text()).slice(0, 300)}`));
      const prDaten = (await pr.json()) as { html_url?: string };
      log(`PR erstellt: ${prDaten.html_url ?? "(URL unbekannt)"}`);
      return { status: "pr-erstellt", bilanz: report, commits, prUrl: prDaten.html_url };
    }

    log(`Lokal-Lauf beendet — ${commits} Commit(s).\n${report}`);
    return { status: "gearbeitet", bilanz: report, commits };
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
  bibliothekarLauf({
    repoPfad: process.env.REPO_PFAD ?? ".",
    baseUrl: process.env.BASE_URL ?? "https://openrouter.ai/api/v1",
    apiKey: process.env.API_KEY ?? "",
    modell: process.env.MODELL ?? "openrouter/auto",
    maxSchritte: Number(process.env.MAX_SCHRITTE ?? 24),
    branch: `librarian/${heute}`,
    forgejo,
  }).catch((e) => {
    console.error(saeubern((e as Error).message));
    process.exit(1);
  });
}
