/** kb-lint v2 (ISC-85): standalone-Prüfung über leseWorkspace + workspacePruefen —
 *  dieselbe Doktrin wie der Server, ohne Server. */
import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { frischeBasis } from "./helfer.ts";
import { leseWorkspace } from "../src/workspace.ts";
import { workspacePruefen } from "../src/validierung.ts";

const lint = (pfad: string) => workspacePruefen(leseWorkspace(pfad));

describe("kb-lint v2", () => {
  test("frische Basis: 0 Fehler", () => {
    expect(lint(frischeBasis().kb).fehler).toEqual([]);
  });

  test("RAW-Datei ohne Frontmatter im normalen Ordner → Fehler", () => {
    const b = frischeBasis();
    writeFileSync(join(b.kb, "RAW", "2026-06-08_kaputt.md"), "kein frontmatter\n");
    expect(lint(b.kb).fehler.some((f) => f.includes("kaputt"))).toBe(true);
  });

  test("kaputter Wiki-Verweis → Fehler", async () => {
    const b = frischeBasis();
    await b.w.quelleAufnehmen((await import("./helfer.ts")).QUELLE);
    // Artikel von Hand mit kaputtem Verweis ablegen (umgeht die Server-Validierung)
    writeFileSync(
      join(b.kb, "Wiki", "Test.md"),
      "Status: These\nStand: 2026-06-08\nQuellen: \n\n## Kurzfassung\n\nK.\n\n## Inhalt\n\nSiehe [[Gibt-Es-Nicht]].\n",
    );
    expect(lint(b.kb).fehler.some((f) => f.includes("Gibt-Es-Nicht"))).toBe(true);
  });

  test("freie Notiz in _notizen/ wird NICHT geprüft (0 Fehler)", () => {
    const b = frischeBasis();
    mkdirSync(join(b.kb, "RAW", "_notizen"), { recursive: true });
    writeFileSync(join(b.kb, "RAW", "_notizen", "frei.md"), "egal, kein frontmatter, kein datum\n");
    expect(lint(b.kb).fehler).toEqual([]);
  });
});
