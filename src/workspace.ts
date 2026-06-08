/**
 * workspace.ts — die Wissensbasis als Datei-Schnappschuss von der Platte lesen.
 *
 * EINE Quelle für die Walk-Logik: der Server (Repo.alsWorkspace, gesundheits_check)
 * UND der standalone kb-lint nutzen exakt dieselbe Lese-Funktion. So driften die
 * beiden nie auseinander — die Doktrin-Prüfung (workspacePruefen) sieht in beiden
 * Fällen genau denselben Snapshot, inklusive RAW-Rekursion und _-Ausschluss.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { WorkspaceDateien } from "./validierung.ts";

/** Alle RAW-Markdown-Dateien rekursiv, Pfade relativ zu RAW/ mit "/". _INGESTED.md
 *  und versteckte Dateien außen vor; _-Ordner sind enthalten (Suche findet alles). */
export function rawDateienVon(rawWurzel: string): string[] {
  const out: string[] = [];
  const geh = (rel: string) => {
    const voll = rel ? join(rawWurzel, rel) : rawWurzel;
    if (!existsSync(voll)) return;
    for (const e of readdirSync(voll, { withFileTypes: true })) {
      if (e.name.startsWith(".")) continue;
      const kind = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) geh(kind);
      else if (e.name.endsWith(".md") && kind !== "_INGESTED.md") out.push(kind);
    }
  };
  geh("");
  return out.sort();
}

/** „Hände weg" (nicht destillieren, nicht prüfen): ein Ordnersegment beginnt mit "_". */
export function istAusgeschlossen(relpath: string): boolean {
  return relpath.split("/").slice(0, -1).some((seg) => seg.startsWith("_"));
}

/** Schnappschuss für die Doktrin-Prüfung: RAW rekursiv (ohne _-Ordner), Wiki/Outputs
 *  flach, plus AGENTS.md/CHANGELOG.md und das Register _INGESTED.md. */
export function leseWorkspace(wurzel: string): WorkspaceDateien {
  const dateien = new Map<string, string>();
  const flach = (ordner: string) => {
    const voll = join(wurzel, ordner);
    if (!existsSync(voll)) return;
    for (const f of readdirSync(voll)) {
      if (f.endsWith(".md")) dateien.set(`${ordner}/${f}`, readFileSync(join(voll, f), "utf8"));
    }
  };
  for (const wd of ["AGENTS.md", "CHANGELOG.md"]) {
    const p = join(wurzel, wd);
    if (existsSync(p)) dateien.set(wd, readFileSync(p, "utf8"));
  }
  const rawW = join(wurzel, "RAW");
  for (const rf of rawDateienVon(rawW)) {
    if (istAusgeschlossen(rf)) continue; // _-Ordner sind nicht Teil der Prüfung
    dateien.set(`RAW/${rf}`, readFileSync(join(rawW, rf), "utf8"));
  }
  const ingested = join(rawW, "_INGESTED.md");
  if (existsSync(ingested)) dateien.set("RAW/_INGESTED.md", readFileSync(ingested, "utf8"));
  flach("Wiki");
  flach("Outputs");
  return { dateien };
}
