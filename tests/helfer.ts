/** Test-Fixtures: frische Wegwerf-Wissensbasis + Blob-Ablage mit fester Uhr. */
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Repo } from "../src/repo.ts";
import { BlobAblage } from "../src/loeschmodul.ts";
import { Werkzeuge } from "../src/werkzeuge.ts";

export const TESTTAG = "2026-06-07";

export function frischeBasis() {
  const wurzel = mkdtempSync(join(tmpdir(), "lokyy-test-"));
  const kb = join(wurzel, "steuerkanzlei_kb");
  mkdirSync(kb, { recursive: true });
  writeFileSync(join(kb, "AGENTS.md"), "# Wissensbasis: Test\n\nThema: Digitalisierung der Steuerkanzlei.\nEs gelten zusätzlich die Regeln aus KNOWLEDGE/AGENTS.md.\n");
  writeFileSync(join(kb, "CHANGELOG.md"), "# Changelog\n");
  mkdirSync(join(kb, "RAW"), { recursive: true });
  mkdirSync(join(kb, "Wiki"), { recursive: true });
  mkdirSync(join(kb, "Outputs"), { recursive: true });
  writeFileSync(join(kb, "RAW", "_INGESTED.md"), "# Register der aufgenommenen Quellen\n\n| Dateiname | Eingangsdatum | Herkunft | Ein-Satz-Beschreibung | verarbeitet |\n|---|---|---|---|---|\n");
  writeFileSync(join(kb, "Wiki", "INDEX.md"), "# Index\n\n");
  writeFileSync(join(kb, "Wiki", "QUESTIONS.md"), "# Offene Fragen\n\n");

  const repo = new Repo(kb, () => new Date(`${TESTTAG}T12:00:00Z`));
  const blobs = new BlobAblage(join(wurzel, ".lokyy-blobs", "steuerkanzlei_kb"), join(wurzel, "schluessel", "schluessel.json"));
  const w = new Werkzeuge(repo, blobs);
  return { wurzel, kb, repo, blobs, w };
}

export const QUELLE = {
  titel: "Die digitale Kanzlei beginnt beim Posteingang",
  inhalt:
    "Die digitale Kanzlei beginnt beim Posteingang\n(Blogartikel, Kanzleiforum.de, 12. Mai 2026, Autorin: R. Brinkmann)\n\n" +
    "Wer Belege digital empfängt, spart Zeit. Die Reihenfolge ist entscheidend - Werkzeuge verstärken Prozesse, sie ersetzen keine.\n",
  typ: "article" as const,
  enthaelt_personendaten_dritter: "nein" as const,
  kurzbeschreibung: "Blogartikel zum digitalen Posteingang als erstem Schritt",
  autor: "R. Brinkmann",
  herkunft: "Kanzleiforum.de, 2026-05-12",
  erscheinungsdatum: "2026-05-12",
};

export const RAW_NAME = `${TESTTAG}_die-digitale-kanzlei-beginnt-beim-posteingang.md`;
