/** RAW-Unterordner + "_"-Ausschluss (ISC-74..77).
 *  - normaler Unterordner: abgelegt, registriert, durchsucht, destilliert
 *  - "_"-Ordner: durchsucht, aber NIE destilliert und NICHT geprüft
 *  - Pfad-Traversal im Ordnernamen wird abgelehnt */
import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { frischeBasis, QUELLE, RAW_NAME } from "./helfer.ts";

describe("RAW-Unterordner & _-Ausschluss", () => {
  test("ausgeschlossen() erkennt nur _-Ordnersegmente", () => {
    const { repo } = frischeBasis();
    expect(repo.ausgeschlossen("_notizen/x.md")).toBe(true);
    expect(repo.ausgeschlossen("a/_b/x.md")).toBe(true);
    expect(repo.ausgeschlossen("transkripte/x.md")).toBe(false);
    expect(repo.ausgeschlossen("2026-06-08_x.md")).toBe(false); // Datei mit _ ist kein Ausschluss
  });

  test("normaler Unterordner: abgelegt, registriert, durchsucht, im Destillat-Auftrag", async () => {
    const basis = frischeBasis();
    await basis.w.quelleAufnehmen({ ...QUELLE, ordner: "transkripte" });
    const rel = `transkripte/${RAW_NAME}`;
    expect(basis.repo.existiert(`RAW/${rel}`)).toBe(true);
    expect(basis.repo.rawDateien()).toContain(rel);
    expect(basis.repo.unverarbeitete().map((q) => q.dateiname)).toContain(rel);
    expect(basis.w.destillatAuftrag()).toContain(rel);
    expect(basis.w.durchsuchen("Posteingang")).toContain(`RAW/${rel}`);
    // verschachtelte Quelle kann ein Artikel zitieren (Quellen-Set kennt den Unterpfad)
    await basis.w.artikelSchreiben({
      slug: "Digitaler-Posteingang", status: "im Aufbau", stand: QUELLE.erscheinungsdatum!,
      quellen: [rel], kurzfassung: "K.", inhalt: "I.", beschreibung: "B",
    });
    expect(basis.repo.existiert("Wiki/Digitaler-Posteingang.md")).toBe(true);
  });

  test('"_"-Ordner: durchsucht, aber NIE destilliert', async () => {
    const basis = frischeBasis();
    // dieselbe Quelle einmal normal, einmal in _notizen
    await basis.w.quelleAufnehmen({ ...QUELLE, ordner: "transkripte" });
    await basis.w.quelleAufnehmen({ ...QUELLE, ordner: "_notizen" });
    const auftrag = basis.w.destillatAuftrag();
    expect(auftrag).toContain(`transkripte/${RAW_NAME}`); // normal: dabei
    expect(auftrag).not.toContain(`_notizen/${RAW_NAME}`); // ausgeschlossen
    // aber durchsuchbar bleibt beides
    expect(basis.w.durchsuchen("Posteingang")).toContain(`RAW/_notizen/${RAW_NAME}`);
  });

  test('freie Notiz in "_"-Ordner: durchsucht, aber Health-Check bleibt sauber', () => {
    const basis = frischeBasis();
    // roh, OHNE Frontmatter, OHNE Datums-Dateiname — würde in RAW/ normal durchfallen
    mkdirSync(join(basis.kb, "RAW", "_notizen"), { recursive: true });
    writeFileSync(join(basis.kb, "RAW", "_notizen", "meine-gedanken.md"), "Einfach eine freie Notiz zum Posteingang.\n");
    expect(basis.w.gesundheitsCheck()).toContain("0 Fehler, 0 Warnungen");
    expect(basis.w.durchsuchen("Posteingang")).toContain("RAW/_notizen/meine-gedanken.md");
  });

  test("Traversal im Ordnernamen wird abgelehnt", async () => {
    const basis = frischeBasis();
    await expect(basis.w.quelleAufnehmen({ ...QUELLE, ordner: "../draussen" })).rejects.toThrow(/Unterordner/);
  });
});
