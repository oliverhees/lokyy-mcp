/** Veredler-Werkzeuge (ISC-78..83): artikel_vernetzen (nicht-destruktiv),
 *  Tags im Artikel, session_speichern. Reine Werkzeug-Ebene, ohne LLM. */
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { frischeBasis, QUELLE, RAW_NAME, TESTTAG } from "./helfer.ts";
import { vernetzungAnwenden } from "../src/validierung.ts";

const ART = (slug: string, extra: Record<string, unknown> = {}) => ({
  slug, status: "im Aufbau" as const, stand: TESTTAG, quellen: [RAW_NAME],
  kurzfassung: "Eine Kurzfassung.", inhalt: "Ein Absatz.\n\n## Beispiel\n\nMit eigener Unterüberschrift.",
  beschreibung: `Beschreibung ${slug}`, ...extra,
});

async function basisMitArtikeln() {
  const b = frischeBasis();
  await b.w.quelleAufnehmen(QUELLE);
  await b.w.artikelSchreiben(ART("Digitaler-Posteingang"));
  await b.w.artikelSchreiben(ART("Beleg-Management"));
  return b;
}

describe("vernetzungAnwenden (rein, nicht-destruktiv)", () => {
  test("fügt Verwandt-Abschnitt hinzu, lässt Inhalt unberührt", () => {
    const original = "Status: im Aufbau\nStand: 2026-06-08\nQuellen: x.md\n\n## Kurzfassung\n\nKurz.\n\n## Inhalt\n\nText mit ## im Fließtext? nein, hier sauber.\n";
    const neu = vernetzungAnwenden(original, { verwandt: ["Anderer-Artikel"] });
    expect(neu).toContain("## Verwandt\n\n- [[Anderer-Artikel]]");
    expect(neu).toContain("## Kurzfassung\n\nKurz.");
    expect(neu).toContain("## Inhalt\n\nText mit ## im Fließtext? nein, hier sauber.");
  });

  test("setzt Tags-Zeile direkt nach Quellen; ersetzt vorhandene", () => {
    const o = "Status: These\nStand: 2026-06-08\nQuellen: \n\n## Kurzfassung\n\nK.\n\n## Inhalt\n\nI.\n";
    const m = vernetzungAnwenden(o, { tags: ["steuer", "digital"] });
    expect(m).toMatch(/Quellen: \nTags: steuer, digital\n/);
    const m2 = vernetzungAnwenden(m, { tags: ["neu"] });
    expect(m2).toContain("Tags: neu");
    expect(m2).not.toContain("steuer");
  });

  test("leeres Verwandt-Array entfernt den Abschnitt, Offene Fragen bleibt", () => {
    const o = "Status: These\nStand: 2026-06-08\nQuellen: \n\n## Kurzfassung\n\nK.\n\n## Inhalt\n\nI.\n\n## Verwandt\n\n- [[X]]\n\n## Offene Fragen\n\n- Warum?\n";
    const m = vernetzungAnwenden(o, { verwandt: [] });
    expect(m).not.toContain("## Verwandt");
    expect(m).toContain("## Offene Fragen\n\n- Warum?");
  });
});

describe("artikel_vernetzen (Werkzeug)", () => {
  test("vernetzt bestehenden Artikel, Inhalt bleibt erhalten", async () => {
    const b = await basisMitArtikeln();
    const vorher = readFileSync(join(b.kb, "Wiki", "Digitaler-Posteingang.md"), "utf8");
    const inhaltKern = vorher.split("## Inhalt")[1];
    await b.w.artikelVernetzen("Digitaler-Posteingang", ["Beleg-Management"], ["posteingang"]);
    const nachher = readFileSync(join(b.kb, "Wiki", "Digitaler-Posteingang.md"), "utf8");
    expect(nachher).toContain("## Verwandt\n\n- [[Beleg-Management]]");
    expect(nachher).toContain("Tags: posteingang");
    expect(nachher.split("## Inhalt")[1]).toContain(inhaltKern.split("## Verwandt")[0].trimEnd().slice(-20));
  });

  test("lehnt Verweis auf nicht existierenden Artikel ab", async () => {
    const b = await basisMitArtikeln();
    await expect(b.w.artikelVernetzen("Digitaler-Posteingang", ["Gibt-Es-Nicht"])).rejects.toThrow(/existiert nicht/);
  });

  test("lehnt Selbstverweis ab", async () => {
    const b = await basisMitArtikeln();
    await expect(b.w.artikelVernetzen("Digitaler-Posteingang", ["Digitaler-Posteingang"])).rejects.toThrow(/sich selbst/);
  });

  test("vernetzter Artikel besteht den Gesundheits-Check", async () => {
    const b = await basisMitArtikeln();
    await b.w.artikelVernetzen("Digitaler-Posteingang", ["Beleg-Management"], ["digital"]);
    expect(b.w.gesundheitsCheck()).toContain("0 Fehler");
  });
});

describe("session_speichern", () => {
  test('legt eine Session-Quelle in RAW/sessions/ an, die destilliert werden kann', async () => {
    const b = frischeBasis();
    await b.w.sessionSpeichern({ titel: "Architektur-Chat zum Posteingang", inhalt: "Wir haben entschieden: Posteingang zuerst." });
    const treffer = b.repo.rawDateien().filter((f) => f.startsWith("sessions/"));
    expect(treffer.length).toBe(1);
    expect(existsSync(join(b.kb, "RAW", treffer[0]))).toBe(true);
    // landet im Register als unverarbeitet → der Nachtlauf nimmt sie auf
    expect(b.repo.unverarbeitete().map((q) => q.dateiname)).toContain(treffer[0]);
    expect(b.w.durchsuchen("Posteingang")).toContain("RAW/sessions/");
  });

  test("Session mit Personendaten landet als Blob+Stub (Lösch-Doktrin greift)", async () => {
    const b = frischeBasis();
    const r = await b.w.sessionSpeichern({
      titel: "Mandantengespraech", inhalt: "Frau Kessler aus Berlin braucht Hilfe.",
      enthaelt_personendaten_dritter: "ja",
    });
    expect(r).toContain("Blob+Stub");
  });
});
