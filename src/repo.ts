/**
 * repo.ts — die Theke. Eine Schreibinstanz pro Wissensbasis-Repo,
 * alle Schreibvorgänge serialisiert, alle Schreibzugriffe atomar.
 *
 * Single-Process-Annahme: GENAU EIN lokyy-mcp-Prozess bedient ein Repo.
 * (Stufe-3-Weiche: ein Server = ein Repo = ein Schlüssel.)
 */
import { mkdirSync, readdirSync, readFileSync, existsSync, renameSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve, dirname, basename } from "node:path";
import { randomBytes } from "node:crypto";
import { Ablehnung } from "./texte.ts";
import { nfc, type WorkspaceDateien } from "./validierung.ts";

export type Uhr = () => Date;

export class Repo {
  readonly wurzel: string;
  private kette: Promise<unknown> = Promise.resolve();
  /** Von der laufenden Schreiboperation berührte Pfade — für exaktes git-Staging. */
  private beruehrt = new Set<string>();

  /** Autonomer Modus (Nachtlauf): Blob+Stub-Quellen werden NIE entschlüsselt und
   *  nie zum Destillieren angeboten — geschützte Personendaten verlassen den
   *  Server nicht, egal welches Cloud-Modell dahinterhängt. */
  autonom = false;

  constructor(wurzel: string, private uhr: Uhr = () => new Date()) {
    this.wurzel = resolve(wurzel);
    if (!existsSync(this.wurzel)) {
      throw new Ablehnung(
        "Repo-Pfad",
        "Der Server bedient genau ein existierendes Wissensbasis-Verzeichnis — er erfindet keines.",
        `Lege das Verzeichnis an oder korrigiere --repo (${this.wurzel}).`,
      );
    }
    for (const ordner of ["RAW", "Wiki", "Outputs"]) mkdirSync(join(this.wurzel, ordner), { recursive: true });
  }

  heute(): string {
    return this.uhr().toISOString().slice(0, 10);
  }

  /** Alle Schreiboperationen laufen durch die Warteschlange — einer nach dem anderen. */
  schreiben<T>(fn: () => T | Promise<T>): Promise<T> {
    const next = this.kette.then(fn, fn);
    this.kette = next.catch(() => {});
    return next;
  }

  /** Pfad-Traversal-Schutz: jeder relative Pfad muss im Repo bleiben. */
  pfad(relativ: string): string {
    const voll = resolve(this.wurzel, nfc(relativ));
    if (voll !== this.wurzel && !voll.startsWith(this.wurzel + "/")) {
      throw new Ablehnung(
        "Repo-Grenze",
        "Der Server liest und schreibt ausschließlich innerhalb der Wissensbasis — alles andere wäre eine Hintertür.",
        "Nutze nur Dateinamen ohne Pfadbestandteile.",
      );
    }
    return voll;
  }

  /** Atomar: erst Temp-Datei im selben Verzeichnis, dann rename. */
  atomarSchreiben(relativ: string, inhalt: string): void {
    const ziel = this.pfad(relativ);
    mkdirSync(dirname(ziel), { recursive: true });
    const tmp = join(dirname(ziel), `.${basename(ziel)}.${randomBytes(4).toString("hex")}.tmp`);
    writeFileSync(tmp, inhalt, "utf8");
    renameSync(tmp, ziel);
    this.beruehrt.add(relativ);
  }

  /** Berührte Pfade der laufenden Operation abholen (und zurücksetzen). */
  beruehrteAbholen(): string[] {
    const pfade = [...this.beruehrt];
    this.beruehrt.clear();
    return pfade;
  }

  lies(relativ: string): string {
    const p = this.pfad(relativ);
    if (!existsSync(p)) {
      throw new Ablehnung(
        "Datei nicht gefunden",
        "Der Server rät nie — was er nicht findet, meldet er ehrlich.",
        `"${relativ}" existiert nicht. Vorhandene Dateien zeigt wissensbasis_durchsuchen oder destillat_auftrag.`,
      );
    }
    return readFileSync(p, "utf8");
  }

  existiert(relativ: string): boolean {
    return existsSync(this.pfad(relativ));
  }

  loeschen(relativ: string): void {
    rmSync(this.pfad(relativ), { force: true });
  }

  rawDateien(): string[] {
    return readdirSync(join(this.wurzel, "RAW"))
      .filter((f) => f.endsWith(".md") && f !== "_INGESTED.md")
      .sort();
  }

  artikelSlugs(): string[] {
    return readdirSync(join(this.wurzel, "Wiki"))
      .filter((f) => f.endsWith(".md") && !["INDEX.md", "QUESTIONS.md"].includes(f))
      .map((f) => f.slice(0, -3))
      .sort();
  }

  // ── Register: RAW/_INGESTED.md ──────────────────────────
  private static REGISTER_KOPF =
    "| Dateiname | Eingangsdatum | Herkunft | Ein-Satz-Beschreibung | verarbeitet |\n" +
    "|---|---|---|---|---|\n";

  registerEintragen(dateiname: string, herkunft: string, beschreibung: string): void {
    const pfad = "RAW/_INGESTED.md";
    let inhalt = this.existiert(pfad) ? this.lies(pfad) : "";
    if (!/\|.*verarbeitet.*\|/i.test(inhalt)) {
      inhalt = `# Register der aufgenommenen Quellen\n\n${Repo.REGISTER_KOPF}`;
    }
    const sauber = (s: string) => s.replace(/\|/g, "/").replace(/\n/g, " ").trim();
    inhalt = inhalt.trimEnd() + `\n| ${sauber(dateiname)} | ${this.heute()} | ${sauber(herkunft)} | ${sauber(beschreibung)} | nein |\n`;
    this.atomarSchreiben(pfad, inhalt);
  }

  registerVerarbeitet(dateiname: string): void {
    const pfad = "RAW/_INGESTED.md";
    const inhalt = this.existiert(pfad) ? this.lies(pfad) : "";
    const zeilen = inhalt.split("\n");
    let getroffen = false;
    const neu = zeilen.map((z) => {
      if (z.includes(`| ${dateiname} |`) || z.includes(`|${dateiname}|`)) {
        getroffen = true;
        return z.replace(/\|\s*nein\s*\|\s*$/, "| ja |");
      }
      return z;
    });
    if (!getroffen) {
      throw new Ablehnung(
        "Register",
        "Das Register ist die Wahrheit darüber, was destilliert wurde — ein Eintrag, den es nicht gibt, kann nicht abgehakt werden.",
        `"${dateiname}" steht nicht in _INGESTED.md. Prüfe den Dateinamen mit destillat_auftrag.`,
      );
    }
    this.atomarSchreiben(pfad, neu.join("\n"));
  }

  /** Ist diese RAW-Datei ein Blob+Stub (geschützte Personendaten)? */
  istStub(dateiname: string): boolean {
    const p = `RAW/${dateiname}`;
    return this.existiert(p) && /^asset: asset:\/\//m.test(this.lies(p));
  }

  unverarbeitete(): { dateiname: string; beschreibung: string; stub: boolean }[] {
    if (!this.existiert("RAW/_INGESTED.md")) return [];
    const zeilen = this.lies("RAW/_INGESTED.md").split("\n");
    const out: { dateiname: string; beschreibung: string; stub: boolean }[] = [];
    for (const z of zeilen) {
      const teile = z.split("|").map((t) => t.trim());
      if (teile.length >= 6 && /\.md$/.test(teile[1]) && teile[5] === "nein") {
        out.push({ dateiname: teile[1], beschreibung: teile[4], stub: this.istStub(teile[1]) });
      }
    }
    return out;
  }

  // ── Index: Wiki/INDEX.md (kanonisches Zeilenformat, alphabetisch) ──
  indexAktualisieren(slug: string, beschreibung: string): void {
    const pfad = "Wiki/INDEX.md";
    const kopf = "# Index\n\n";
    const inhalt = this.existiert(pfad) ? this.lies(pfad) : kopf;
    const zeilen = inhalt.split("\n").filter((z) => z.startsWith("- [["));
    const map = new Map<string, string>();
    for (const z of zeilen) {
      const m = z.match(/^- \[\[([^\]]+)\]\] — (.*)$/);
      if (m) map.set(m[1], m[2]);
    }
    map.set(slug, beschreibung.replace(/\n/g, " ").trim());
    const sortiert = [...map.entries()].sort(([a], [b]) => a.localeCompare(b, "de"));
    this.atomarSchreiben(pfad, kopf + sortiert.map(([s, b]) => `- [[${s}]] — ${b}`).join("\n") + "\n");
  }

  // ── Changelog der Wissensbasis ──────────────────────────
  changelog(eintrag: string): void {
    const pfad = "CHANGELOG.md";
    const inhalt = this.existiert(pfad) ? this.lies(pfad) : "# Changelog\n\n";
    this.atomarSchreiben(pfad, inhalt.trimEnd() + `\n- ${this.heute()} — ${eintrag.replace(/\n/g, " ").trim()}\n`);
  }

  // ── Schnappschuss für die Doktrin-Prüfung ───────────────
  alsWorkspace(): WorkspaceDateien {
    const dateien = new Map<string, string>();
    const sammle = (ordner: string) => {
      const voll = join(this.wurzel, ordner);
      if (!existsSync(voll)) return;
      for (const f of readdirSync(voll)) {
        if (f.endsWith(".md")) dateien.set(`${ordner}/${f}`, readFileSync(join(voll, f), "utf8"));
      }
    };
    for (const wurzelDatei of ["AGENTS.md", "CHANGELOG.md"]) {
      if (this.existiert(wurzelDatei)) dateien.set(wurzelDatei, this.lies(wurzelDatei));
    }
    sammle("RAW");
    sammle("Wiki");
    sammle("Outputs");
    return { dateien };
  }
}
