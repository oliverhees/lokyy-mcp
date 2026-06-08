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
  tagPruefen,
  titelZuSlug,
  vernetzungAnwenden,
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
  /** Optionaler RAW-Unterordner zur Ablage, z. B. "transkripte". Ordner mit
   *  "_"-Präfix ("_notizen") werden vom Nachtlauf nie destilliert. */
  ordner?: string;
}

/** RAW-Unterordner prüfen: ein oder mehrere Segmente aus Wort-/Bindestrich-Zeichen,
 *  kein Traversal. Liefert den bereinigten Pfad oder "" (kein Unterordner). */
function ordnerPruefen(roh?: string): string {
  const o = (roh ?? "").trim().replace(/^\/+|\/+$/g, "");
  if (o === "") return "";
  if (!/^[\p{L}\p{N}_-]+(\/[\p{L}\p{N}_-]+)*$/u.test(o) || o.includes("..")) {
    throw new Ablehnung(
      "RAW-Unterordner",
      "Ein Unterordner besteht aus Wort-/Zahl-/Bindestrich-Zeichen (z. B. transkripte oder _notizen) — Pfadzeichen wären eine Hintertür.",
      `Nutze einen einfachen Ordnernamen statt "${roh}".`,
    );
  }
  return o;
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
      const ordner = ordnerPruefen(a.ordner);
      const dateiname = `${meta.date_added}_${titelZuSlug(meta.titel)}.md`;
      const relpfad = ordner ? `${ordner}/${dateiname}` : dateiname;
      if (this.repo.existiert(`RAW/${relpfad}`)) {
        throw new Ablehnung(
          "Register",
          "Eine RAW-Datei wird nie überschrieben — sie ist unantastbar, sonst wäre die Beweisgrundlage manipulierbar.",
          `"${relpfad}" existiert bereits. Wähle einen unterscheidenden Titel oder prüfe, ob die Quelle schon aufgenommen ist.`,
        );
      }

      if (a.enthaelt_personendaten_dritter === "ja") {
        // Lösch-Doktrin Gleis 1: Klartext erreicht das Repo NIE.
        const assetId = this.blobs.ablegen(a.inhalt);
        const stub =
          frontmatterRendern({ ...meta, asset: assetId, anonymized: a.anonymisiert }) +
          "\n" +
          stubKoerper(assetId, a.kurzbeschreibung);
        this.repo.atomarSchreiben(`RAW/${relpfad}`, stub);
        this.repo.registerEintragen(relpfad, meta.source_url, `${a.kurzbeschreibung} [Blob+Stub]`);
        this.repo.changelog(`Quelle (personenbezogen, als Blob+Stub) aufgenommen: ${relpfad}`);
        return (
          `Aufgenommen als Blob+Stub: RAW/${relpfad}\n` +
          `Der Klartext liegt verschlüsselt AUSSERHALB des Repos (${assetId}).\n` +
          `Im Register vermerkt, verarbeitet=nein.` +
          this.committe(`Quelle (Blob+Stub) aufgenommen: ${relpfad}`)
        );
      }

      // Wörtlichkeit: byte-treu, nichts „verschönern".
      const datei = frontmatterRendern(meta) + "\n" + a.inhalt;
      this.repo.atomarSchreiben(`RAW/${relpfad}`, datei);
      this.repo.registerEintragen(relpfad, meta.source_url, a.kurzbeschreibung);
      this.repo.changelog(`Quelle aufgenommen: ${relpfad}`);
      return `Aufgenommen: RAW/${relpfad} (wörtlich, ${a.inhalt.length} Zeichen). Im Register vermerkt, verarbeitet=nein.` +
        this.committe(`Quelle aufgenommen: ${relpfad}`);
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
      if (this.repo.autonom) {
        // Harte Schranke: Im Nachtlauf wird kein Personendaten-Blob entschlüsselt.
        // Der Bibliothekar sieht nur den Stub — geschütztes Wissen verlässt den
        // Server nie Richtung Cloud, unabhängig vom Modell.
        return (
          `[Personenbezogene Quelle — im autonomen Nachtlauf NICHT entschlüsselt.]\n` +
          `Diese Quelle bleibt dem nächtlichen Bibliothekar verschlossen; sie wird nur ` +
          `lokal mit ausdrücklicher Freigabe des Besitzers bearbeitet.\n\n${inhalt}`
        );
      }
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

  // ── artikel_vernetzen (Veredler — nicht-destruktiv) ─────
  /**
   * Setzt NUR Verwandt-Verweise und Tags eines bestehenden Artikels neu —
   * Kurzfassung und Inhalt bleiben unangetastet. Damit darf der Veredelungs-Lauf
   * vernetzen, ohne je die Prosa des Besitzers oder des Bibliothekars umzuschreiben.
   */
  artikelVernetzen(slug: string, verwandt?: string[], tags?: string[]): Promise<string> {
    return this.repo.schreiben(() => {
      const s = slugPruefen(slug);
      const pfad = `Wiki/${s}.md`;
      if (!this.repo.existiert(pfad)) {
        throw new Ablehnung(
          "Artikel nicht gefunden",
          "Vernetzen gilt für bestehende Artikel — der Server legt dabei keinen neuen an.",
          `"${s}" existiert nicht im Wiki. Lege ihn zuerst mit artikel_schreiben an.`,
        );
      }
      const vorhandene = new Set(this.repo.artikelSlugs());
      for (const v of verwandt ?? []) {
        slugPruefen(v);
        if (v === s) {
          throw new Ablehnung("Verweis-Doktrin (a)", "Ein Artikel verweist nicht auf sich selbst.", `Entferne "${v}" aus den Verwandt-Verweisen.`);
        }
        if (!vorhandene.has(v)) {
          throw new Ablehnung(
            "Verweis-Doktrin (a)",
            "Verwandt-Verweise zeigen zeichengenau auf existierende Artikel — sonst zerfällt das Wiki still.",
            `"${v}" existiert nicht im Wiki.`,
          );
        }
      }
      for (const t of tags ?? []) tagPruefen(t);
      const alt = this.repo.lies(pfad);
      const neu = vernetzungAnwenden(alt, { verwandt, tags });
      if (neu === alt) return `Keine Änderung an ${pfad} — Vernetzung war bereits aktuell.`;
      this.repo.atomarSchreiben(pfad, neu);
      this.repo.changelog(`Artikel vernetzt: [[${s}]]`);
      return (
        `Vernetzt: ${pfad}` +
        (verwandt ? ` — ${verwandt.length} Verweis(e)` : "") +
        (tags ? `, ${tags.length} Tag(s)` : "") +
        ` (Inhalt unverändert).` +
        this.committe(`Artikel vernetzt: ${s}`)
      );
    });
  }

  // ── notiz_anlegen ("neue Notiz") ───────────────────────
  /**
   * Legt eine strukturierte persönliche Notiz in RAW/_notizen/ an — mit festem
   * Frontmatter (title, date_added, type, tags). Bewusst in der „Hände weg"-Zone:
   * durchsuchbar, aber NIE destilliert und NICHT vom Struktur-Check geprüft.
   * Das feste Schema sorgt dafür, dass Notizen nicht im Wildwuchs untergehen.
   */
  notizAnlegen(a: { titel: string; inhalt: string; tags?: string[] }): Promise<string> {
    return this.repo.schreiben(() => {
      const titel = nfc(a.titel.trim());
      if (titel.length === 0) {
        throw new Ablehnung("Notiz", "Eine Notiz braucht einen Titel — er wird zum Dateinamen und macht sie auffindbar.", "Gib der Notiz einen kurzen Titel.");
      }
      if (a.inhalt.trim().length === 0) {
        throw new Ablehnung("Notiz", "Eine leere Notiz hält nichts fest.", "Schreib den Gedanken in `inhalt`.");
      }
      for (const t of a.tags ?? []) tagPruefen(t);
      const dateiname = `${this.repo.heute()}_${titelZuSlug(titel)}.md`;
      const relpfad = `_notizen/${dateiname}`;
      if (this.repo.existiert(`RAW/${relpfad}`)) {
        throw new Ablehnung("Notiz", "Es gibt heute schon eine Notiz mit diesem Titel.", `"${relpfad}" existiert bereits. Wähle einen unterscheidenden Titel.`);
      }
      const fm = ["---", `title: ${titel}`, `date_added: ${this.repo.heute()}`, "type: note"];
      if (a.tags && a.tags.length > 0) fm.push(`tags: ${a.tags.join(", ")}`);
      fm.push("---", "");
      this.repo.atomarSchreiben(`RAW/${relpfad}`, fm.join("\n") + a.inhalt.trim() + "\n");
      this.repo.changelog(`Notiz angelegt: ${relpfad}`);
      return `Notiz angelegt: RAW/${relpfad} — durchsuchbar, aber nicht destilliert (dein persönliches Notiz-Fach).` +
        this.committe(`Notiz angelegt: ${dateiname}`);
    });
  }

  // ── session_speichern ("save this session") ────────────
  /**
   * Hält die Kernerkenntnisse eines Chats als Quelle in RAW/sessions/ fest —
   * dünne Hülle über quelle_aufnehmen. So gelangt auch ins Gehirn, was nur im
   * Gespräch gesagt wurde; der Nachtlauf destilliert es wie jede andere Quelle.
   */
  sessionSpeichern(a: { titel: string; inhalt: string; kurzbeschreibung?: string; enthaelt_personendaten_dritter?: "ja" | "nein" }): Promise<string> {
    return this.quelleAufnehmen({
      titel: a.titel,
      inhalt: a.inhalt,
      typ: "note",
      enthaelt_personendaten_dritter: a.enthaelt_personendaten_dritter ?? "nein",
      kurzbeschreibung: a.kurzbeschreibung?.trim() || `Session-Notiz: ${a.titel.trim()}`,
      herkunft: "Chat-Session",
      ordner: "sessions",
    });
  }

  // ── destillat_auftrag / quelle_verarbeitet_markieren ────
  destillatAuftrag(): string {
    const alle = this.repo.unverarbeitete();
    // Im autonomen Modus sind Blob+Stub-Quellen tabu — sie werden weder gelistet
    // noch entschlüsselt; nur lokal mit Freigabe bearbeitbar.
    const offen = this.repo.autonom ? alle.filter((q) => !q.stub) : alle;
    const uebersprungen = this.repo.autonom ? alle.filter((q) => q.stub).length : 0;
    const fussnote = uebersprungen > 0
      ? `\n\nHinweis: ${uebersprungen} personenbezogene Quelle(n) wurden bewusst ausgelassen — sie bleiben dem Nachtlauf verschlossen (Datenschutz).`
      : "";
    if (offen.length === 0) {
      return "Nichts zu destillieren — alle für den Nachtlauf zugänglichen Quellen sind verarbeitet. Das ist ein gutes Ergebnis, kein Fehler." + fussnote;
    }
    return (
      `DESTILLAT-AUFTRAG (${offen.length} unverarbeitete Quelle(n)):\n\n` +
      offen.map((q) => `- ${q.dateiname} — ${q.beschreibung}`).join("\n") +
      fussnote +
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
