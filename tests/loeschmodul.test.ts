import { describe, expect, test } from "bun:test";
import { execSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { frischeBasis, QUELLE, TESTTAG } from "./helfer.ts";
import { Ablehnung } from "../src/texte.ts";

const PII_QUELLE = {
  ...QUELLE,
  titel: "Mandantengespraech Notizen",
  inhalt: "Gespräch mit Frau Kessler am 3. Juni: Einkommen 84.000 €, Scheidung läuft, Sohn studiert.",
  enthaelt_personendaten_dritter: "ja" as const,
  kurzbeschreibung: "Gesprächsnotiz einer Mandantin (anonym beschrieben)",
};
const STUB_NAME = `${TESTTAG}_mandantengespraech-notizen.md`;

describe("Lösch-Doktrin (ISC-38..45)", () => {
  test("PII-Quelle: Klartext erreicht das Repo nie, Stub trägt asset-ID (ISC-38/39)", async () => {
    const { kb, wurzel, w } = frischeBasis();
    await w.quelleAufnehmen(PII_QUELLE);

    const stub = readFileSync(join(kb, "RAW", STUB_NAME), "utf8");
    expect(stub).toContain("asset: asset://");
    expect(stub).not.toContain("Kessler");
    expect(stub).not.toContain("84.000");

    // Nirgendwo im Repo-Verzeichnis liegt der Klartext (ISC-45-Basis)
    const alleDateien = execSync(`grep -rl "Kessler" ${kb} || true`).toString().trim();
    expect(alleDateien).toBe("");

    // Blob existiert außerhalb, verschlüsselt
    const blobDir = join(wurzel, ".lokyy-blobs", "steuerkanzlei_kb");
    const blobs = readdirSync(blobDir);
    expect(blobs.length).toBe(1);
    const blobRoh = readFileSync(join(blobDir, blobs[0]));
    expect(blobRoh.toString("utf8")).not.toContain("Kessler");
  });

  test("quelle_lesen entschlüsselt zur Laufzeit (ISC-40)", async () => {
    const { w } = frischeBasis();
    await w.quelleAufnehmen(PII_QUELLE);
    const gelesen = w.quelleLesen(STUB_NAME);
    expect(gelesen).toContain("Entschlüsselt aus asset://");
    expect(gelesen).toContain("Frau Kessler");
  });

  test("loeschen_auf_verlangen: Blob+Schlüssel weg, Stub wird Tombstone, Suche blind (ISC-41/42/43)", async () => {
    const { kb, wurzel, w, repo, blobs } = frischeBasis();
    await w.quelleAufnehmen(PII_QUELLE);
    const meldung = await w.loeschenAufVerlangen(STUB_NAME);
    expect(meldung).toContain("endgültig unlesbar");

    // Tombstone
    const stub = readFileSync(join(kb, "RAW", STUB_NAME), "utf8");
    expect(stub).toContain(`geloescht: ${TESTTAG}`);
    expect(stub).toContain("GELÖSCHT am");

    // Blob-Datei und Schlüssel vernichtet
    const blobDir = join(wurzel, ".lokyy-blobs", "steuerkanzlei_kb");
    expect(readdirSync(blobDir)).toEqual([]);

    // Lesen → definierter Fehler, kein Absturz (ISC-40 Fehlerpfad)
    const gelesen = w.quelleLesen(STUB_NAME);
    expect(gelesen).toContain("auf Verlangen gelöscht");

    // Suche findet den Inhalt nicht mehr (ISC-42)
    expect(w.durchsuchen("Kessler")).toContain("Keine Treffer");

    // Destillat-Auftrag stolpert nicht über den Tombstone (ISC-43)
    expect(() => w.destillatAuftrag()).not.toThrow();
    // Gesundheits-Check ohne Falschbefund zum Tombstone (ISC-43)
    expect(w.gesundheitsCheck()).not.toContain(STUB_NAME + ": Frontmatter");
  });

  test("git-History enthält nie Klartext (ISC-42)", async () => {
    const { kb, w } = frischeBasis();
    execSync(`git init -q -b main ${kb} && git -C ${kb} add -A && git -C ${kb} commit -qm start`);
    await w.quelleAufnehmen(PII_QUELLE);
    execSync(`git -C ${kb} add -A && git -C ${kb} commit -qm "quelle aufgenommen"`);
    await w.loeschenAufVerlangen(STUB_NAME);
    execSync(`git -C ${kb} add -A && git -C ${kb} commit -qm "geloescht"`);
    const history = execSync(`git -C ${kb} log -p`).toString();
    expect(history).not.toContain("Kessler");
    expect(history).not.toContain("84.000");
  });

  test("Klartext-RAW kann NICHT per Tool gelöscht werden — Notfallprozedur-Verweis (ISC-44)", async () => {
    const { w } = frischeBasis();
    await w.quelleAufnehmen(QUELLE);
    const name = `${TESTTAG}_die-digitale-kanzlei-beginnt-beim-posteingang.md`;
    const fehler = await w.loeschenAufVerlangen(name).catch((e) => e as Ablehnung);
    expect(fehler).toBeInstanceOf(Ablehnung);
    expect((fehler as Ablehnung).message).toContain("NOTFALL-History-Rewrite");
  });

  test("Fehlerpfad: auch bei kaputtem Folge-Schritt liegt nie Klartext im Repo (ISC-45)", async () => {
    const { kb, w, blobs } = frischeBasis();
    // Sabotage: Schlüsseldatei schreibgeschützt machen ist plattformabhängig fragil —
    // stattdessen: prüfen, dass die Blob-Ablage VOR jedem Repo-Schreiben passiert,
    // indem eine Ablehnung im Register-Schritt provoziert wird (| im Dateinamen unmöglich,
    // also provozieren wir über doppelte Aufnahme):
    await w.quelleAufnehmen(PII_QUELLE);
    const zweite = await w.quelleAufnehmen(PII_QUELLE).catch((e) => e as Ablehnung);
    expect(zweite).toBeInstanceOf(Ablehnung);
    const alleDateien = execSync(`grep -rl "Kessler" ${kb} || true`).toString().trim();
    expect(alleDateien).toBe("");
  });

  test("zwei PII-Quellen mit identischem Klartext sind getrennt löschbar (ISC-41 Regression)", async () => {
    const { kb, wurzel, w } = frischeBasis();
    // Zwei eigenständige Mandantenakten mit zufällig gleichem Wortlaut.
    const klartext = "Standardklausel: Mandant verzichtet auf Widerruf.";
    await w.quelleAufnehmen({ ...PII_QUELLE, titel: "Akte Alpha", inhalt: klartext });
    await w.quelleAufnehmen({ ...PII_QUELLE, titel: "Akte Beta", inhalt: klartext });

    // Trotz identischen Klartexts: zwei getrennte Blobs (keine content-adressierte Kollision).
    const blobDir = join(wurzel, ".lokyy-blobs", "steuerkanzlei_kb");
    expect(readdirSync(blobDir).length).toBe(2);

    // Löschen der einen Akte lässt die andere unangetastet und lesbar.
    await w.loeschenAufVerlangen(`${TESTTAG}_akte-alpha.md`);
    expect(readdirSync(blobDir).length).toBe(1);
    const beta = w.quelleLesen(`${TESTTAG}_akte-beta.md`);
    expect(beta).toContain("Standardklausel");
    // Die gelöschte Akte ist endgültig ein Tombstone.
    expect(w.quelleLesen(`${TESTTAG}_akte-alpha.md`)).toContain("auf Verlangen gelöscht");
  });

  test("Schlüssel- und Blob-Verzeichnis dürfen nicht ineinander liegen", () => {
    const { wurzel } = frischeBasis();
    expect(() => {
      const { BlobAblage } = require("../src/loeschmodul.ts");
      new BlobAblage(join(wurzel, "b"), join(wurzel, "b", "schluessel.json"));
    }).toThrow(/Schlüsseltrennung/);
  });
});
