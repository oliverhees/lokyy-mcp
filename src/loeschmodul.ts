/**
 * loeschmodul.ts — die Lösch-Doktrin (G3) als Mechanik.
 *
 * Personendaten Dritter erreichen NIE das Klartext-Repo: Der Inhalt wird
 * AES-256-GCM-verschlüsselt AUSSERHALB des Repos abgelegt; im Repo liegt nur
 * ein Stub mit stabiler, content-adressierter asset-ID. Löschen = Blob UND
 * Schlüsseleintrag vernichten; der Stub wird zum Tombstone.
 *
 * Nonce-Disziplin: ein frischer Schlüssel + frische IV je Asset, jedes Asset
 * wird genau einmal verschlüsselt — keine Nonce-Wiederverwendung möglich.
 *
 * Ehrliche Grenze (dokumentiert, nicht versteckt): Crypto-Shredding löscht,
 * was DIESER Schlüsselbund kennt. Eigene Backups der Schlüsseldatei liegen in
 * der Verantwortung des Besitzers — wer Schlüssel kopiert, kopiert Zugriff.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, renameSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { Ablehnung } from "./texte.ts";

export class BlobAblage {
  readonly verzeichnis: string;
  readonly schluesselDatei: string;

  constructor(verzeichnis: string, schluesselDatei: string) {
    this.verzeichnis = resolve(verzeichnis);
    this.schluesselDatei = resolve(schluesselDatei);
    if (this.schluesselDatei.startsWith(this.verzeichnis + "/")) {
      throw new Ablehnung(
        "Schlüsseltrennung",
        "Schlüssel und Blobs in einem Verzeichnis wären ein einziger Fundort — die Trennung ist der Sinn der Architektur.",
        "Lege die Schlüsseldatei außerhalb des Blob-Verzeichnisses ab (Standard: ~/.lokyy/schluessel.json).",
      );
    }
    mkdirSync(this.verzeichnis, { recursive: true });
    mkdirSync(dirname(this.schluesselDatei), { recursive: true });
  }

  private schluesselLesen(): Record<string, string> {
    if (!existsSync(this.schluesselDatei)) return {};
    return JSON.parse(readFileSync(this.schluesselDatei, "utf8"));
  }

  private schluesselSchreiben(bund: Record<string, string>): void {
    const tmp = this.schluesselDatei + "." + randomBytes(4).toString("hex") + ".tmp";
    writeFileSync(tmp, JSON.stringify(bund, null, 2), { mode: 0o600 });
    renameSync(tmp, this.schluesselDatei);
  }

  private blobPfad(id: string): string {
    return join(this.verzeichnis, id.replace("asset://", "") + ".bin");
  }

  /**
   * Verschlüsselt ablegen → eindeutige Asset-ID je Aufnahme.
   *
   * Die ID ist NICHT content-adressiert: Zwei eigenständige PII-Quellen mit
   * zufällig identischem Klartext (zwei Mandanten, dieselbe Standardklausel)
   * müssen getrennte Blobs, getrennte Schlüssel und ein getrenntes Löschen
   * auf Verlangen bekommen. Eine content-adressierte ID würde beide auf einen
   * Blob kollabieren — Löschen der einen Quelle würde die andere mitlöschen
   * (Datenverlust) bzw. ein Löschverlangen für eine ungewollt mit erfüllen.
   * Deshalb: frische Zufalls-Entropie je Aufnahme, keine Wiederverwendung.
   */
  ablegen(klartext: string): string {
    const id = `asset://${randomBytes(16).toString("hex")}`;
    const schluessel = randomBytes(32);
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", schluessel, iv);
    const chiffrat = Buffer.concat([cipher.update(klartext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    writeFileSync(this.blobPfad(id), Buffer.concat([iv, tag, chiffrat]), { mode: 0o600 });
    const bund = this.schluesselLesen();
    bund[id] = schluessel.toString("base64");
    this.schluesselSchreiben(bund);
    return id;
  }

  lesen(id: string): string {
    const bund = this.schluesselLesen();
    const schluesselB64 = bund[id];
    if (!schluesselB64) {
      throw new Ablehnung(
        "Schlüssel fehlt",
        "Ohne Schlüssel ist ein Blob endgültig unlesbar — genau das ist die Lösch-Garantie. Entweder wurde dieser Inhalt auf Verlangen gelöscht, oder die Schlüsseldatei ist nicht die richtige.",
        `Wenn der Inhalt gelöscht wurde, ist das korrekt so. Andernfalls prüfe den Pfad der Schlüsseldatei (${this.schluesselDatei}).`,
      );
    }
    const pfad = this.blobPfad(id);
    if (!existsSync(pfad)) {
      throw new Ablehnung(
        "Blob fehlt",
        "Der Schlüssel existiert, aber der verschlüsselte Inhalt nicht — die Blob-Ablage ist unvollständig.",
        `Prüfe das Blob-Verzeichnis (${this.verzeichnis}).`,
      );
    }
    const roh = readFileSync(pfad);
    const iv = roh.subarray(0, 12);
    const tag = roh.subarray(12, 28);
    const chiffrat = roh.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", Buffer.from(schluesselB64, "base64"), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(chiffrat), decipher.final()]).toString("utf8");
  }

  /** Löschen auf Verlangen: Blob UND Schlüsseleintrag vernichten. */
  vernichten(id: string): void {
    rmSync(this.blobPfad(id), { force: true });
    const bund = this.schluesselLesen();
    delete bund[id];
    this.schluesselSchreiben(bund);
  }

  kennt(id: string): boolean {
    return id in this.schluesselLesen();
  }
}

/** Stub-Körper für das Repo — beschreibt, verrät aber nichts. */
export function stubKoerper(assetId: string, kurzbeschreibung: string): string {
  return (
    `Dieser Inhalt enthält personenbezogene Daten Dritter und liegt deshalb\n` +
    `als verschlüsselter Blob AUSSERHALB des Repos (Lösch-Doktrin).\n\n` +
    `asset: ${assetId}\n\n` +
    `Kurzbeschreibung ohne Personenbezug: ${kurzbeschreibung.trim()}\n\n` +
    `Lesen: quelle_lesen mit diesem Dateinamen — der Server entschlüsselt zur Laufzeit.\n` +
    `Löschen auf Verlangen: loeschen_auf_verlangen — vernichtet Blob und Schlüssel.\n`
  );
}

export function tombstoneKoerper(datum: string): string {
  return (
    `GELÖSCHT am ${datum} — auf Verlangen (Lösch-Doktrin).\n\n` +
    `Der verschlüsselte Inhalt und sein Schlüssel wurden vernichtet.\n` +
    `Dieser Tombstone bleibt als ehrliche Spur stehen: Hier WAR eine Quelle.\n`
  );
}
