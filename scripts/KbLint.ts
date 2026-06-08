#!/usr/bin/env bun
/**
 * kb-lint v2 — prüft eine Wissensbasis mit GENAU der Doktrin, die der Server im
 * Schreibpfad erzwingt (workspacePruefen über dasselbe Modul). Standalone: kein
 * Server, kein Modell, kein API-Key — nur Lesen und Prüfen.
 *
 * Nutzung:
 *   bun scripts/KbLint.ts [<kb-pfad>]      # Default: aktuelles Verzeichnis
 *
 * Exit-Code: 0 = sauber (oder nur Warnungen), 1 = Fehler, 2 = Pfad nicht gefunden.
 * So lässt sich kb-lint auch als CI-Schritt oder pre-commit-Hook einsetzen.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { leseWorkspace } from "../src/workspace.ts";
import { workspacePruefen } from "../src/validierung.ts";

const pfad = resolve(process.argv[2] ?? ".");
if (!existsSync(pfad)) {
  console.error(`kb-lint: Pfad nicht gefunden: ${pfad}`);
  process.exit(2);
}

const { fehler, warnungen } = workspacePruefen(leseWorkspace(pfad));

if (fehler.length === 0 && warnungen.length === 0) {
  console.log("✓ kb-lint: 0 Fehler, 0 Warnungen — die Wissensbasis ist strukturell gesund.");
  process.exit(0);
}

console.log(`kb-lint: ${fehler.length} Fehler, ${warnungen.length} Warnung(en)\n`);
for (const f of fehler) console.log(`✗ ${f}`);
for (const w of warnungen) console.log(`⚠ ${w}`);
console.log(
  `\nRepariere nur durch Umbiegen oder Registerpflege — Verweise und Quellen-Zeilen ` +
  `werden nie still gelöscht; fehlende Belege sind eine Entscheidung des Besitzers.`,
);
process.exit(fehler.length > 0 ? 1 : 0);
