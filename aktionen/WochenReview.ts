#!/usr/bin/env bun
/**
 * WochenReview.ts — der Montags-Bericht (B3).
 *
 * Bewusst DETERMINISTISCH und ohne LLM: liest Commits, CHANGELOG-Einträge und
 * neue Dateien der letzten sieben Tage und baut daraus den Bericht. Keine
 * API-Kosten, kein Modell, nichts zu halluzinieren — nur Lese- und
 * Issue-Rechte. Mit FORGEJO_* wird ein Issue angelegt, sonst stdout.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { saeubern } from "../src/gitintegration.ts";

export interface ReviewKonfiguration {
  repoPfad: string;
  heute?: Date;
  forgejo?: { url: string; repo: string; token: string };
}

function git(repo: string, args: string[]): string {
  try {
    return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
  } catch {
    return "";
  }
}

function kw(d: Date): number {
  const ziel = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  ziel.setUTCDate(ziel.getUTCDate() + 4 - (ziel.getUTCDay() || 7));
  const jahresanfang = new Date(Date.UTC(ziel.getUTCFullYear(), 0, 1));
  return Math.ceil(((ziel.getTime() - jahresanfang.getTime()) / 86400000 + 1) / 7);
}

export function wochenBericht(cfg: ReviewKonfiguration): { titel: string; text: string } {
  const heute = cfg.heute ?? new Date();
  const seit = new Date(heute.getTime() - 7 * 86400000).toISOString().slice(0, 10);

  const commits = git(cfg.repoPfad, ["log", `--since=${seit}`, "--pretty=%ad — %s", "--date=short"])
    .trim().split("\n").filter(Boolean);
  const neueDateien = git(cfg.repoPfad, ["log", `--since=${seit}`, "--diff-filter=A", "--name-only", "--pretty=format:"])
    .trim().split("\n").filter((z) => z.endsWith(".md"));
  const neuRaw = [...new Set(neueDateien.filter((d) => d.startsWith("RAW/") && !d.endsWith("_INGESTED.md")))];
  const neuWiki = [...new Set(neueDateien.filter((d) => d.startsWith("Wiki/") && !/INDEX|QUESTIONS/.test(d)))];

  const changelogPfad = join(cfg.repoPfad, "CHANGELOG.md");
  const changelog = existsSync(changelogPfad)
    ? readFileSync(changelogPfad, "utf8").split("\n").filter((z) => {
        const m = z.match(/^- (\d{4}-\d{2}-\d{2}) — /);
        return m && m[1] >= seit;
      })
    : [];

  const titel = `Weekly Review KW ${kw(heute)}`;
  const text =
    `## ${titel}\n\nZeitraum: seit ${seit}\n\n` +
    `**Die Woche in Zahlen:** ${commits.length} Commit(s) · ${neuRaw.length} neue Quelle(n) · ${neuWiki.length} neue(r) Artikel\n\n` +
    (neuRaw.length ? `### Neue Quellen\n${neuRaw.map((d) => `- ${d.slice(4)}`).join("\n")}\n\n` : "") +
    (neuWiki.length ? `### Neue Artikel\n${neuWiki.map((d) => `- ${d.slice(5, -3)}`).join("\n")}\n\n` : "") +
    (changelog.length ? `### Aus dem Changelog\n${changelog.join("\n")}\n\n` : "") +
    (commits.length === 0
      ? `Eine stille Woche — nichts passiert ist auch eine ehrliche Auskunft.\n`
      : `*Dieser Bericht ist rein mechanisch erzeugt (Commits, Changelog, Dateiliste) — er liest nur und verändert nichts.*\n`);
  return { titel, text };
}

export async function wochenReview(cfg: ReviewKonfiguration): Promise<string> {
  const { titel, text } = wochenBericht(cfg);
  if (!cfg.forgejo) {
    console.log(text);
    return "stdout";
  }
  const api = `${cfg.forgejo.url.replace(/\/$/, "")}/api/v1/repos/${cfg.forgejo.repo}/issues`;
  const res = await fetch(api, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `token ${cfg.forgejo.token}` },
    body: JSON.stringify({ title: titel, body: text }),
  });
  if (!res.ok) throw new Error(saeubern(`Issue-Erstellung fehlgeschlagen (${res.status}): ${(await res.text()).slice(0, 300)}`));
  const daten = (await res.json()) as { html_url?: string };
  console.error(`Issue erstellt: ${daten.html_url ?? "(URL unbekannt)"}`);
  return daten.html_url ?? "erstellt";
}

if (import.meta.main) {
  const forgejo =
    process.env.FORGEJO_URL && process.env.FORGEJO_REPO && process.env.FORGEJO_TOKEN
      ? { url: process.env.FORGEJO_URL, repo: process.env.FORGEJO_REPO, token: process.env.FORGEJO_TOKEN }
      : undefined;
  wochenReview({ repoPfad: process.env.REPO_PFAD ?? ".", forgejo }).catch((e) => {
    console.error(saeubern((e as Error).message));
    process.exit(1);
  });
}
