import { describe, expect, test } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { frischeBasis, QUELLE, RAW_NAME, TESTTAG } from "./helfer.ts";
import { Ablehnung } from "../src/texte.ts";
import { workspacePruefen } from "../src/validierung.ts";

describe("quelle_aufnehmen (ISC-6, 7, 27)", () => {
  test("speichert wörtlich, registriert mit verarbeitet=nein, schreibt Changelog (ISC-6/7/16)", async () => {
    const { kb, w } = frischeBasis();
    const meldung = await w.quelleAufnehmen(QUELLE);
    expect(meldung).toContain(RAW_NAME);

    const datei = readFileSync(join(kb, "RAW", RAW_NAME), "utf8");
    // Frontmatter vollständig
    for (const feld of ["title:", "author:", "source_url:", "date_added:", "date_published:", "type:"]) {
      expect(datei).toContain(feld);
    }
    // Wörtlichkeit: Body byte-identisch (ISC-27) — inkl. ASCII-Bindestrich
    const body = datei.split("---\n").slice(2).join("---\n").replace(/^\n/, "");
    expect(body).toBe(QUELLE.inhalt);
    expect(body).toContain("entscheidend - Werkzeuge");

    const register = readFileSync(join(kb, "RAW", "_INGESTED.md"), "utf8");
    expect(register).toContain(`| ${RAW_NAME} | ${TESTTAG} |`);
    expect(register).toMatch(/\| nein \|\s*$/m);
    expect(readFileSync(join(kb, "CHANGELOG.md"), "utf8")).toContain("Quelle aufgenommen");
  });

  test("lehnt unbekannten type ab — mit Regel, Grund, Korrektur (ISC-22/25)", async () => {
    const { w } = frischeBasis();
    const kaputt = { ...QUELLE, typ: "blogpost" };
    await expect(w.quelleAufnehmen(kaputt)).rejects.toThrow(Ablehnung);
    const fehler = (await w.quelleAufnehmen(kaputt).catch((e) => e)) as Ablehnung;
    expect(fehler.message).toContain("ABGELEHNT");
    expect(fehler.message).toContain("Warum es diese Regel gibt");
    expect(fehler.message).toContain("So geht es richtig");
  });

  test("lehnt falsches Datumsformat ab (ISC-23)", async () => {
    const { w } = frischeBasis();
    await expect(w.quelleAufnehmen({ ...QUELLE, erscheinungsdatum: "12. Mai 2026" })).rejects.toThrow(/JJJJ-MM-TT/);
  });

  test("überschreibt nie eine bestehende RAW-Datei", async () => {
    const { w } = frischeBasis();
    await w.quelleAufnehmen(QUELLE);
    await expect(w.quelleAufnehmen(QUELLE)).rejects.toThrow(/nie überschrieben/);
  });

  test("parallele Aufnahmen korrumpieren das Register nicht (ISC-17)", async () => {
    const { kb, w } = frischeBasis();
    await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        w.quelleAufnehmen({ ...QUELLE, titel: `Quelle Nummer ${i}` }),
      ),
    );
    const register = readFileSync(join(kb, "RAW", "_INGESTED.md"), "utf8");
    const zeilen = register.split("\n").filter((z) => z.includes("| nein |"));
    expect(zeilen.length).toBe(8);
  });
});

describe("RAW-Dateinamen bleiben lint-konform (ISC-24/48 Regression)", () => {
  test("Titel mit Diakritika und Emoji erzeugt einen RAW-Namen, den der Gesundheits-Check akzeptiert", async () => {
    const { kb, w } = frischeBasis();
    // é/ñ sind nicht im RAW-Vokabular [a-z0-9äöüß-]; ein naiver Slug würde eine
    // Datei anlegen, die der eigene Lint später als "ohne Datums-Präfix" meldet.
    await w.quelleAufnehmen({ ...QUELLE, titel: "Café résumé señor" });
    await w.quelleAufnehmen({ ...QUELLE, titel: "🤖🤖🤖" });

    const rawNamen = readFileSync(join(kb, "RAW", "_INGESTED.md"), "utf8");
    expect(rawNamen).toContain(`${TESTTAG}_cafe-resume-senor.md`);
    // Emoji-only-Titel fällt auf "quelle" zurück statt auf einen leeren Slug.
    expect(rawNamen).toContain(`${TESTTAG}_quelle.md`);
    expect(existsSync(join(kb, "RAW", `${TESTTAG}_.md`))).toBe(false);

    // Der eigene Gesundheits-Check meldet keine kaputten RAW-Dateinamen.
    expect(w.gesundheitsCheck()).not.toContain("ohne Datums-Präfix");
  });
});

describe("artikel_schreiben — die harte Schranke (ISC-11, 18-26)", () => {
  async function mitQuelle() {
    const basis = frischeBasis();
    await basis.w.quelleAufnehmen(QUELLE);
    return basis;
  }
  const artikel = {
    slug: "Digitaler-Posteingang",
    status: "im Aufbau" as const,
    stand: TESTTAG,
    quellen: [RAW_NAME],
    kurzfassung: "Der digitale Posteingang ist der erste Schritt der Kanzlei-Digitalisierung.",
    inhalt: "Belege digital empfangen spart Zeit. Die Reihenfolge entscheidet.",
    beschreibung: "Warum der Posteingang zuerst kommt",
  };

  test("legt Artikel kanonisch an und pflegt INDEX (ISC-11)", async () => {
    const { kb, w } = await mitQuelle();
    await w.artikelSchreiben(artikel);
    const txt = readFileSync(join(kb, "Wiki", "Digitaler-Posteingang.md"), "utf8");
    expect(txt).toMatch(/^Status: im Aufbau\nStand: 2026-06-07\nQuellen: /);
    expect(txt).toContain("## Kurzfassung");
    const idx = readFileSync(join(kb, "Wiki", "INDEX.md"), "utf8");
    expect(idx).toContain("- [[Digitaler-Posteingang]] — Warum der Posteingang zuerst kommt");
  });

  test("lehnt Quellen-Verweis als [[...]] ab (ISC-20)", async () => {
    const { w } = await mitQuelle();
    await expect(w.artikelSchreiben({ ...artikel, quellen: [`[[${RAW_NAME}]]`] })).rejects.toThrow(/Klartext/);
  });

  test("lehnt nicht existierende Quelle ab (ISC-21)", async () => {
    const { w } = await mitQuelle();
    await expect(w.artikelSchreiben({ ...artikel, quellen: ["2026-01-01_gibt-es-nicht.md"] })).rejects.toThrow(/liegt nicht in RAW/);
  });

  test("lehnt kaputten [[Verweis]] im Inhalt ab (ISC-19)", async () => {
    const { w } = await mitQuelle();
    await expect(
      w.artikelSchreiben({ ...artikel, inhalt: "Siehe [[Gibt-Es-Nicht]]." }),
    ).rejects.toThrow(/kein Ziel/);
  });

  test("lehnt [[Verweis]] auf RAW-Datei ab (ISC-20)", async () => {
    const { w } = await mitQuelle();
    await expect(
      w.artikelSchreiben({ ...artikel, inhalt: `Siehe [[${RAW_NAME.slice(0, -3)}]].` }),
    ).rejects.toThrow(/Verweis-Doktrin/);
  });

  test("lehnt unbelegten Nicht-These-Artikel ab (Quellenpflicht)", async () => {
    const { w } = await mitQuelle();
    await expect(w.artikelSchreiben({ ...artikel, quellen: [] })).rejects.toThrow(/These/);
  });

  test("lehnt Slug mit Leerzeichen ab (ISC-24)", async () => {
    const { w } = await mitQuelle();
    await expect(w.artikelSchreiben({ ...artikel, slug: "Digitaler Posteingang" })).rejects.toThrow(/Zeichen für Zeichen/);
  });

  test("Überschreib-Schutz: Update nur mit aktualisieren=true", async () => {
    const { w } = await mitQuelle();
    await w.artikelSchreiben(artikel);
    await expect(w.artikelSchreiben(artikel)).rejects.toThrow(/aktualisieren=true/);
    const ok = await w.artikelSchreiben({ ...artikel, aktualisieren: true, status: "These", quellen: [] });
    expect(ok).toContain("Aktualisiert");
  });

  test("lehnt [[Verweis]] in der INDEX-Beschreibung ab (Forge-Befund)", async () => {
    const { w } = await mitQuelle();
    await expect(
      w.artikelSchreiben({ ...artikel, beschreibung: "siehe [[Digitaler-Posteingang]]" }),
    ).rejects.toThrow(/INDEX-Zeilenformat/);
  });

  test("gültige [[Verweise]] zwischen Artikeln funktionieren (ISC-19 Gegenpro­be)", async () => {
    const { w } = await mitQuelle();
    await w.artikelSchreiben(artikel);
    const zweiter = await w.artikelSchreiben({
      ...artikel,
      slug: "Reihenfolge-vor-Werkzeug",
      inhalt: "Werkzeuge verstärken Prozesse. Siehe [[Digitaler-Posteingang]].",
      verwandt: ["Digitaler-Posteingang"],
      beschreibung: "Prozess vor Werkzeug",
    });
    expect(zweiter).toContain("Angelegt");
  });
});

describe("Destillat-Kreislauf und Reports (ISC-12, 13, 14)", () => {
  test("destillat_auftrag listet Unverarbeitetes, markieren setzt ja (ISC-14)", async () => {
    const { kb, w } = frischeBasis();
    await w.quelleAufnehmen(QUELLE);
    expect(w.destillatAuftrag()).toContain(RAW_NAME);
    await w.verarbeitetMarkieren(RAW_NAME);
    expect(w.destillatAuftrag()).toContain("Nichts zu destillieren");
    expect(readFileSync(join(kb, "RAW", "_INGESTED.md"), "utf8")).toMatch(/\| ja \|\s*$/m);
  });

  test("frage_vorbereiten warnt bei unverarbeitetem RAW (ISC-12)", async () => {
    const { w } = frischeBasis();
    await w.quelleAufnehmen(QUELLE);
    const auftrag = w.frageVorbereiten("Womit fange ich bei der Digitalisierung an?");
    expect(auftrag).toContain("unverarbeitete Quelle");
    expect(auftrag).toContain(`${TESTTAG}_`);
  });

  test("report_ablegen verweigert [[Verweise]] (ISC-13)", async () => {
    const { w } = frischeBasis();
    await expect(
      w.reportAblegen({ frage: "Testfrage?", inhalt: "Siehe [[Digitaler-Posteingang]]" }),
    ).rejects.toThrow(/Outputs/);
    const ok = await w.reportAblegen({ frage: "Womit anfangen?", inhalt: "Antwort. Genutzter Artikel: Digitaler-Posteingang." });
    expect(ok).toContain("Outputs/2026-06-07_womit-anfangen.md");
  });
});

describe("gesundheits_check (ISC-15) und Lint-Kompatibilität (ISC-48)", () => {
  test("frische Basis: leere Bilanz ist ein gutes Ergebnis", () => {
    const { w } = frischeBasis();
    expect(w.gesundheitsCheck()).toContain("0 Fehler, 0 Warnungen");
  });

  test("per Server befüllter Workspace besteht die Doktrin-Prüfung mit 0/0 (ISC-48)", async () => {
    const { repo, w } = frischeBasis();
    await w.quelleAufnehmen(QUELLE);
    await w.artikelSchreiben({
      slug: "Digitaler-Posteingang",
      status: "im Aufbau",
      stand: TESTTAG,
      quellen: [RAW_NAME],
      kurzfassung: "Kern.",
      inhalt: "Inhalt.",
      beschreibung: "Posteingang zuerst",
    });
    await w.verarbeitetMarkieren(RAW_NAME);
    await w.reportAblegen({ frage: "Frage?", inhalt: "Antwort ohne Verweise." });
    const befund = workspacePruefen(repo.alsWorkspace());
    expect(befund.fehler).toEqual([]);
    expect(befund.warnungen).toEqual([]);
  });
});

describe("Repo-Grenze (ISC-53)", () => {
  test("Pfad-Traversal wird abgelehnt", async () => {
    const { w } = frischeBasis();
    expect(() => w.quelleLesen("../../../etc/passwd")).toThrow(Ablehnung);
    await expect(
      w.reportAblegen({ frage: "x?", inhalt: "y", dateiname: "../boese.md" }),
    ).rejects.toThrow(Ablehnung);
    expect(() => w.artikelLesen("../AGENTS")).toThrow(Ablehnung);
  });
});

describe("Wörtlichkeits-Property (ISC-47)", () => {
  test("Sonderzeichen, Umbrüche, Bindestriche überleben den Roundtrip byte-treu", async () => {
    const proben = [
      "Zeile eins\nZeile zwei - mit ASCII-Strich\n\n\tTab und  Doppel-Leerzeichen\n",
      "Unicode: ÄÖÜß — Gedankenstrich – Halbgeviert … Ellipse „Anführung“\n",
      "Markdown-Fallen: ## Überschrift\n- Liste\n```code```\n---\n[Link](x) ![Bild](y)\n",
      "RTL und Emoji: مرحبا 🤖 ​ Zero-Width\n",
    ];
    for (const [i, inhalt] of proben.entries()) {
      const { kb, w } = frischeBasis();
      await w.quelleAufnehmen({ ...QUELLE, titel: `Probe ${i}`, inhalt });
      const name = `${TESTTAG}_probe-${i}.md`;
      const datei = readFileSync(join(kb, "RAW", name), "utf8");
      const body = datei.split("---\n").slice(2).join("---\n").replace(/^\n/, "");
      expect(body).toBe(inhalt);
    }
  });
});
