#!/usr/bin/env bun
/** Einmaliger echter Adapter-Durchstich (ISC-63): Wegwerf-KB, eine Mini-Quelle,
 *  echtes Modell via OpenRouter. Key NUR aus der Umgebung. */
import { execSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bibliothekarLauf } from "../aktionen/Bibliothekar.ts";

const key = process.env.API_KEY ?? "";
if (!key) { console.error("API_KEY fehlt in der Umgebung."); process.exit(2); }

const wurzel = mkdtempSync(join(tmpdir(), "lokyy-durchstich-"));
const kb = join(wurzel, "test_kb");
mkdirSync(join(kb, "RAW"), { recursive: true });
mkdirSync(join(kb, "Wiki"), { recursive: true });
mkdirSync(join(kb, "Outputs"), { recursive: true });
writeFileSync(join(kb, "AGENTS.md"), "# Wissensbasis: Durchstich-Test\n\nThema: Digitalisierung kleiner Kanzleien.\nFokus: Posteingang, Werkzeugwahl.\n");
writeFileSync(join(kb, "CHANGELOG.md"), "# Changelog\n");
writeFileSync(join(kb, "RAW", "_INGESTED.md"), "# Register der aufgenommenen Quellen\n\n| Dateiname | Eingangsdatum | Herkunft | Ein-Satz-Beschreibung | verarbeitet |\n|---|---|---|---|---|\n| 2026-06-01_posteingang-zuerst.md | 2026-06-01 | Kursnotiz | Kurznotiz zum digitalen Posteingang | nein |\n");
writeFileSync(join(kb, "RAW", "2026-06-01_posteingang-zuerst.md"),
  "---\ntitle: Posteingang zuerst\nauthor: Kursteam\nsource_url: unbekannt\ndate_added: 2026-06-01\ndate_published: unbekannt\ntype: note\n---\n\nWer Belege digital empfängt, spart jede Woche Zeit. Der digitale Posteingang ist der erste Schritt jeder Kanzlei-Digitalisierung - vor jeder Software-Entscheidung.\n");
writeFileSync(join(kb, "Wiki", "INDEX.md"), "# Index\n\n");
writeFileSync(join(kb, "Wiki", "QUESTIONS.md"), "# Offene Fragen\n\n");
execSync(`git -C ${kb} init -q -b main && git -C ${kb} -c user.name=t -c user.email=t@t add -A && git -C ${kb} -c user.name=t -c user.email=t@t commit -qm start`);

console.error(`Durchstich gegen ${process.env.BASE_URL ?? "https://openrouter.ai/api/v1"} mit MODELL=${process.env.MODELL ?? "openrouter/auto"} …`);
const ergebnis = await bibliothekarLauf({
  repoPfad: kb,
  baseUrl: process.env.BASE_URL ?? "https://openrouter.ai/api/v1",
  apiKey: key,
  modell: process.env.MODELL ?? "openrouter/auto",
  maxSchritte: 12,
  branch: "librarian/durchstich",
});
console.error(`\n=== ERGEBNIS: status=${ergebnis.status}, commits=${ergebnis.commits} ===`);
console.error(execSync(`git -C ${kb} log --pretty="%s" librarian/durchstich`).toString());
console.error(execSync(`ls ${join(kb, "Wiki")}`).toString());
