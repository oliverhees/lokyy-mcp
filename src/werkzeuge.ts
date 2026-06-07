/**
 * werkzeuge.ts — die deterministischen Werkzeuge des Bibliothekars.
 *
 * Grundsatz: Der Server denkt nicht. Er speichert wörtlich, validiert hart,
 * liefert Arbeitsaufträge — die Denkarbeit (destillieren, formulieren) bleibt
 * beim Agenten, der ihn benutzt. Deshalb ist jede Funktion hier ohne LLM
 * testbar: gleicher Input, gleicher Repo-Zustand, gleiches Ergebnis.
 */
import { Repo } from "./repo.ts";
import { GitSchicht } from "./gitintegration.ts";
import { BlobAblage, stubKoerper, tombstoneKoerper } from "./loeschmodul.ts";
import { Ablehnung } from "./texte.ts";
import {
  artikelPruefen,
  artikelRendern,
  datumPruefen,
  frontmatterRendern,
  indexZeile,
  kurzform,
  nfc,
  quellenMetaPruefen,
  reportPruefen,
  slugPruefen,
  titelZuSlug,
  workspacePruefen,
  type ArtikelFelder,
} from "./validierung.ts";

export interface QuelleAufnehmenArgs {
  titel: string;
  inhalt: string;
  typ: string;
  enthaelt_personendaten_dritter: "ja" | "nein";
  kurzbeschreibung: string;
  autor?: string;
  herkunft?: string;
  erscheinungsdatum?: string;
  anonymisiert?: boolean;
}

export class Werkzeuge {
  constructor(
    private repo: Repo,
    private blobs: BlobAblage,
    /** v1.1: optionale git-Schicht — ohne sie kein einziger git-Aufruf (ISC-55). */
    private git?: GitSchicht,
  ) {}

  /** Nach einer gelungenen Schreiboperation: exakt deren Pfade committen. */
  private committe(nachricht: string): string {
    const pfade = this.repo.beruehrteAbholen();
    return this.git ? this.git.commit(nachricht, pfade) : "";
  }

  // ── quelle_aufnehmen ────────────────────────────────────
  quelleAufnehmen(a: QuelleAufnehmenArgs): Promise<string> {
    return this.repo.schreiben(() => {
      const meta = {
        titel: nfc(a.titel.trim()),
        autor: a.autor?.trim() || "unbekannt",
        source_url: a.herkunft?.trim() || "unbekannt",
        date_added: this.repo.heute(),
        date_published: a.erscheinungsdatum?.trim() || "unbekannt",
        typ: a.typ,
      };
      quellenMetaPruefen(meta);
      if (a.inhalt.trim().length === 0) {
        throw new Ablehnung(
          "Wörtlichkeit",
          "RAW ist die Beweisgrundlage — eine leere Quelle kann nichts belegen.",
          "Übergib den vollständigen Quelltext in `inhalt`.",
        );
      }
      const dateiname = `${meta.date_added}_${titelZuSlug(meta.titel)}.md`;
      if (this.repo.existiert(`RAW/${dateiname}`)) {
        throw new Ablehnung(
          "Register",
          "Eine RAW-Datei wird nie überschrieben — sie ist unantastbar, sonst wäre die Beweisgrundlage manipulierbar.",
          `"${dateiname}" existiert bereits. Wähle einen unterscheidenden Titel oder prüfe, ob die Quelle schon aufgenommen ist.`,
        );
      }

      if (a.enthaelt_personendaten_dritter === "ja") {
        // Lösch-Doktrin Gleis 1: Klartext erreicht das Repo NIE.
        const assetId = this.blobs.ablegen(a.inhalt);
        const stub =
          frontmatterRendern({ ...meta, asset: assetId, anonymized: a.anonymisiert }) +
          "\n" +
          stubKoerper(assetId, a.kurzbeschreibung);
        this.repo.atomarSchreiben(`RAW/${dateiname}`, stub);
        this.repo.registerEintragen(dateiname, meta.source_url, `${a.kurzbeschreibung} [Blob+Stub]`);
        this.repo.changelog(`Quelle (personenbezogen, als Blob+Stub) aufgenommen: ${dateiname}`);
        return (
          `Aufgenommen als Blob+Stub: RAW/${dateiname}\n` +
          `Der Klartext liegt verschlüsselt AUSSERHALB des Repos (${assetId}).\n` +
          `Im Register vermerkt, verarbeitet=nein.` +
          this.committe(`Quelle (Blob+Stub) aufgenommen: ${dateiname}`)
        );
      }

      // Wörtlichkeit: byte-treu, nichts „verschönern".
      const datei = frontmatterRendern(meta) + "\n" + a.inhalt;
      this.repo.atomarSchreiben(`RAW/${dateiname}`, datei);
      this.repo.registerEintragen(dateiname, meta.source_url, a.kurzbeschreibung);
      this.repo.changelog(`Quelle aufgenommen: ${dateiname}`);
      return `Aufgenommen: RAW/${dateiname} (wörtlich, ${a.inhalt.length} Zeichen). Im Register vermerkt, verarbeitet=nein.` +
        this.committe(`Quelle aufgenommen: ${dateiname}`);
    });
  }

  // ── quelle_lesen ────────────────────────────────────────
  quelleLesen(dateiname: string): string {
    const inhalt = this.repo.lies(`RAW/${nfc(dateiname)}`);
    const asset = inhalt.match(/^asset: (asset:\/\/[0-9a-f]+)$/m);
    if (inhalt.includes("geloescht:")) {
      return `Diese Quelle wurde auf Verlangen gelöscht (Tombstone).\n\n${inhalt}`;
    }
    if (asset) {
      const klartext = this.blobs.lesen(asset[1]);
      return `[Entschlüsselt aus ${asset[1]} — Klartext liegt NICHT im Repo]\n\n${klartext}`;
    }
    return inhalt;
  }

  // ── wissensbasis_durchsuchen ────────────────────────────
  durchsuchen(suchbegriff: string): string {
    const begriff = nfc(suchbegriff).toLowerCase();
    if (begriff.trim().length < 2) {
      throw new Ablehnung(
        "Suche",
        "Ein Ein-Zeichen-Suchbegriff trifft alles und nichts.",
        "Nutze mindestens zwei Zeichen.",
      );
    }
    const treffer: string[] = [];
    const suche = (pfad: string, inhalt: string) => {
      inhalt.split("\n").forEach((zeile, i) => {
        if (zeile.toLowerCase().includes(begriff)) {
          treffer.push(`${pfad}:${i + 1}: ${zeile.trim().slice(0, 160)}`);
        }
      });
    };
    for (const slug of this.repo.artikelSlugs()) suche(`Wiki/${slug}.md`, this.repo.lies(`Wiki/${slug}.md`));
    for (const rf of this.repo.rawDateien()) suche(`RAW/${rf}`, this.repo.lies(`RAW/${rf}`));
    if (treffer.length === 0) return `Keine Treffer für "${suchbegriff}" — weder im Wiki noch in RAW.`;
    return `Treffer für "${suchbegriff}" (Wiki zuerst — destilliertes Wissen vor Rohmaterial):\n\n${treffer.slice(0, 50).join("\n")}${treffer.length > 50 ? `\n… und ${treffer.length - 50} weitere.` : ""}`;
  }

  // ── artikel_lesen / artikel_schreiben ───────────────────
  artikelLesen(slug: string): string {
    return this.repo.lies(`Wiki/${slugPruefen(slug)}.md`);
  }

  artikelSchreiben(f: ArtikelFelder & { beschreibung: string; aktualisieren?: boolean }): Promise<string> {
    return this.repo.schreiben(() => {
      const ktx = {
        artikelSlugs: new Set(this.repo.artikelSlugs()),
        rawDateien: new Set(this.repo.rawDateien()),
      };
      artikelPruefen(f, ktx);
      if (f.beschreibung.includes("[[")) {
        throw new Ablehnung(
          "INDEX-Zeilenformat",
          "Die INDEX-Beschreibung ist Prosa — ihr fester Rahmen ist '- [[Slug]] — Ein-Satz-Beschreibung'; zusätzliche [[Verweise]] darin machen den Index maschinell unprüfbar.",
          "Formuliere die Beschreibung ohne [[..]]; verwandte Artikel gehören in den Verwandt-Abschnitt des Artikels.",
        );
      }
      const pfad = `Wiki/${f.slug}.md`;
      const existiert = this.repo.existiert(pfad);
      if (existiert && !f.aktualisieren) {
        throw new Ablehnung(
          "Überschreib-Schutz",
          "Ein bestehender Artikel wird nie stillschweigend ersetzt — Änderungen sind eine bewusste Entscheidung (und git hält die Historie).",
          `"${f.slug}" existiert. Setze aktualisieren=true, wenn die Änderung gewollt ist.`,
        );
      }
      this.repo.atomarSchreiben(pfad, artikelRendern(f));
      this.repo.indexAktualisieren(f.slug, f.beschreibung);
      this.repo.changelog(`Artikel ${existiert ? "aktualisiert" : "angelegt"}: [[${f.slug}]] (${f.status})`);
      return `${existiert ? "Aktualisiert" : "Angelegt"}: ${pfad} — Status ${f.status}, ${f.quellen.length} Quelle(n). INDEX-Zeile: ${indexZeile(f.slug, f.beschreibung)}` +
        this.committe(`Artikel ${existiert ? "aktualisiert" : "angelegt"}: ${f.slug}`);
    });
  }

  // ── destillat_auftrag / quelle_verarbeitet_markieren ────
  destillatAuftrag(): string {
    const offen = this.repo.unverarbeitete();
    if (offen.length === 0) {
      return "Nichts zu destillieren — alle registrierten Quellen sind verarbeitet. Das ist ein gutes Ergebnis, kein Fehler.";
    }
    return (
      `DESTILLAT-AUFTRAG (${offen.length} unverarbeitete Quelle(n)):\n\n` +
      offen.map((q) => `- ${q.dateiname} — ${q.beschreibung}`).join("\n") +
      `\n\nVorgehen (die Denkarbeit liegt bei dir, der Server validiert):\n` +
      `1. Lies jede Quelle mit quelle_lesen.\n` +
      `2. Ein Artikel = ein Konzept; erzwinge keine Aufteilung bei kurzen Quellen.\n` +
      `3. Schreibe Artikel mit artikel_schreiben — Status: gesichert (mehrere Quellen), im Aufbau (eine Quelle), These (unbelegt). Bei frischen Wissensbasen ist "alles im Aufbau" normal.\n` +
      `4. Markiere jede fertig destillierte Quelle mit quelle_verarbeitet_markieren.\n` +
      `5. Widersprüche zwischen gut belegten Quellen löst du nicht auf — verlinke sie in beiden Artikeln.`
    );
  }

  verarbeitetMarkieren(dateiname: string): Promise<string> {
    return this.repo.schreiben(() => {
      this.repo.registerVerarbeitet(nfc(dateiname));
      this.repo.changelog(`Quelle als verarbeitet markiert: ${dateiname}`);
      return `Markiert: ${dateiname} → verarbeitet=ja.` + this.committe(`Quelle verarbeitet: ${dateiname}`);
    });
  }

  // ── frage_vorbereiten / report_ablegen ──────────────────
  frageVorbereiten(frage: string): string {
    const offen = this.repo.unverarbeitete();
    const hinweis =
      offen.length > 0
        ? `\n\nACHTUNG: ${offen.length} unverarbeitete Quelle(n) in RAW — eine Antwort ist nur so gut wie der letzte Destillier-Lauf. Empfiehl dem Besitzer zuerst destillat_auftrag.`
        : "";
    const treffer = this.durchsuchen(
      kurzform(frage).split("-")[0] || frage.split(/\s+/)[0] || frage,
    );
    return (
      `FRAGE-AUFTRAG: "${frage}"\n\n` +
      `Reihenfolge: erst Wiki (destilliert), dann RAW (Belege), Web-Suche nur nach Rückfrage.\n` +
      `Report-Dateiname: ${this.repo.heute()}_${kurzform(frage)}.md (lege ihn mit report_ablegen ab).\n` +
      `Im Report: Frage, strukturierte Antwort, genutzte Artikel und RAW-Quellen als KLARTEXT-Namen (keine [[Verweise]] — die gibt es nur im Wiki), Spannungen, 2-3 Anschlussfragen.${hinweis}\n\n` +
      `Erste Suchtreffer als Einstieg:\n${treffer}`
    );
  }

  reportAblegen(args: { frage: string; inhalt: string; dateiname?: string }): Promise<string> {
    return this.repo.schreiben(() => {
      reportPruefen(args.inhalt);
      const name = nfc(args.dateiname?.trim() || `${this.repo.heute()}_${kurzform(args.frage)}.md`);
      if (!/^[\p{L}\p{N}_.-]+\.md$/u.test(name)) {
        throw new Ablehnung(
          "Dateinamen-Konvention",
          "Report-Namen folgen JJJJ-MM-TT_frage-kurzform.md — vorhersehbar und ohne Pfadzeichen.",
          `Nutze z. B. ${this.repo.heute()}_${kurzform(args.frage)}.md`,
        );
      }
      this.repo.atomarSchreiben(`Outputs/${name}`, `# ${args.frage.trim()}\n\n${args.inhalt.trim()}\n`);
      this.repo.changelog(`Report abgelegt: Outputs/${name}`);
      return `Abgelegt: Outputs/${name}` + this.committe(`Report abgelegt: ${name}`);
    });
  }

  // ── gesundheits_check ───────────────────────────────────
  gesundheitsCheck(): string {
    const befund = workspacePruefen(this.repo.alsWorkspace());
    if (befund.fehler.length === 0 && befund.warnungen.length === 0) {
      return "GESUNDHEITS-CHECK: 0 Fehler, 0 Warnungen — die Wissensbasis ist strukturell gesund. Eine leere Bilanz ist ein gutes Ergebnis.";
    }
    return (
      `GESUNDHEITS-CHECK: ${befund.fehler.length} Fehler, ${befund.warnungen.length} Warnungen\n\n` +
      befund.fehler.map((f) => `✗ ${f}`).join("\n") +
      (befund.warnungen.length ? "\n" + befund.warnungen.map((w) => `⚠ ${w}`).join("\n") : "") +
      `\n\nRepariere nur durch Umbiegen oder Registerpflege — Verweise und Quellen-Zeilen werden nie still gelöscht; fehlende Belege sind eine Entscheidung des Besitzers.`
    );
  }

  // ── loeschen_auf_verlangen ──────────────────────────────
  loeschenAufVerlangen(dateiname: string): Promise<string> {
    return this.repo.schreiben(() => {
      const pfad = `RAW/${nfc(dateiname)}`;
      const inhalt = this.repo.lies(pfad);
      const asset = inhalt.match(/^asset: (asset:\/\/[0-9a-f]+)$/m);
      if (!asset) {
        throw new Ablehnung(
          "Lösch-Doktrin",
          "Löschen-auf-Verlangen gilt für Blob+Stub-Quellen (Personendaten). Klartext-RAW ist append-only; für Altfälle in der git-History gibt es nur die dokumentierte Notfallprozedur.",
          `"${dateiname}" ist keine Stub-Datei. Für Klartext-Altfälle: docs/NOTFALL-History-Rewrite.md — ausdrücklich die Ausnahme, nie der Alltagsweg.`,
        );
      }
      this.blobs.vernichten(asset[1]);
      const meta = inhalt.split("---")[1] ?? "";
      const titel = meta.match(/^title: (.*)$/m)?.[1] ?? "unbekannt";
      const tombstone =
        `---\ntitle: ${titel}\nauthor: entfernt\nsource_url: entfernt\ndate_added: unbekannt\ndate_published: unbekannt\ntype: other\ngeloescht: ${this.repo.heute()}\n---\n\n` +
        tombstoneKoerper(this.repo.heute());
      this.repo.atomarSchreiben(pfad, tombstone);
      this.repo.changelog(`Auf Verlangen gelöscht: ${dateiname} (Blob + Schlüssel vernichtet, Stub → Tombstone)`);
      return (
        `Gelöscht auf Verlangen: ${dateiname}\n` +
        `Blob und Schlüsseleintrag sind vernichtet — der Inhalt ist endgültig unlesbar.\n` +
        `Der Stub ist jetzt ein Tombstone; die git-History enthielt nie Klartext.` +
        this.committe(`Auf Verlangen gelöscht: ${dateiname}`)
      );
    });
  }
}
