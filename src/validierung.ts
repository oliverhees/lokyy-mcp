/**
 * validierung.ts — die Lokyy-Doktrin als Code. EINE Regelquelle:
 * Der Server erzwingt sie im Schreibpfad, kb-lint v2 prüft mit demselben Modul.
 *
 * Alle Funktionen sind rein (kein I/O) — der Kontext (vorhandene Artikel,
 * RAW-Dateien) wird hereingereicht. Das hält die Doktrin ohne LLM testbar.
 */
import { Ablehnung, STATUS_TRIAS, TYP_VOKABULAR } from "./texte.ts";

export const DATUM = /^\d{4}-\d{2}-\d{2}$/;
export const RAW_DATEINAME = /^\d{4}-\d{2}-\d{2}_[a-z0-9äöüß-]+\.md$/;
export const VERWEIS = /\[\[([^\]]+)\]\]/g;

export interface DoktrinKontext {
  artikelSlugs: Set<string>;
  rawDateien: Set<string>;
}

export interface ArtikelFelder {
  slug: string;
  status: (typeof STATUS_TRIAS)[number];
  stand: string; // JJJJ-MM-TT
  quellen: string[]; // RAW-Dateinamen, Klartext
  kurzfassung: string;
  inhalt: string;
  verwandt?: string[]; // Slugs anderer Artikel
  offene_fragen?: string[];
}

export interface QuellenMeta {
  titel: string;
  autor: string;
  source_url: string;
  date_added: string;
  date_published: string;
  typ: string;
}

/** Unicode-NFC, damit „ä" immer dieselben Bytes hat — egal welches Werkzeug tippt. */
export function nfc(s: string): string {
  return s.normalize("NFC");
}

/** Slug-Doktrin: Titel mit Bindestrichen, Dateiname = Verweis-Text, zeichengenau. */
export function slugPruefen(slug: string): string {
  const s = nfc(slug.trim());
  if (s.length === 0 || s.includes("/") || s.includes("\\") || s.includes("..")) {
    throw new Ablehnung(
      "Slug-Doktrin",
      "Der Slug ist Dateiname UND Verweis-Text — Pfadzeichen würden das Dateisystem verlassen und Verweise unprüfbar machen.",
      "Nutze nur Wortzeichen und Bindestriche, z. B. Digitaler-Posteingang.",
    );
  }
  if (!/^[\p{L}\p{N}-]+$/u.test(s) || /\s/.test(s)) {
    throw new Ablehnung(
      "Slug-Doktrin",
      "Verweis-Text und Dateiname müssen Zeichen für Zeichen übereinstimmen — Leer- und Sonderzeichen brechen diese Garantie.",
      `Ersetze Leer- und Sonderzeichen durch Bindestriche: "${s.replace(/[^\p{L}\p{N}]+/gu, "-")}".`,
    );
  }
  return s;
}

/**
 * Lateinische Diakritika, die das RAW-Dateinamen-Vokabular ([a-z0-9äöüß-])
 * NICHT erlaubt, auf ihre Basisbuchstaben abbilden. Deutsche Umlaute und ß
 * bleiben absichtlich erhalten — sie sind im Vokabular und Teil der Sprache.
 */
const DIAKRITIKA: Record<string, string> = {
  à: "a", á: "a", â: "a", ã: "a", å: "a", ā: "a",
  ç: "c", č: "c",
  è: "e", é: "e", ê: "e", ë: "e", ē: "e",
  ì: "i", í: "i", î: "i", ï: "i", ī: "i",
  ñ: "n", ń: "n",
  ò: "o", ó: "o", ô: "o", õ: "o", ø: "o", ō: "o",
  ù: "u", ú: "u", û: "u", ū: "u",
  ý: "y", ÿ: "y",
  š: "s", ž: "z",
};

/**
 * Titel → kanonischer Slug (für RAW-Dateinamen und Verweise).
 *
 * Garantie: Das Ergebnis erfüllt immer RAW_DATEINAME-Vokabular ([a-z0-9äöüß-])
 * und ist nie leer — sonst würde der Server eine Datei anlegen, die sein
 * eigener Gesundheits-Check (workspacePruefen) als kaputt meldet. Titel ganz
 * ohne verwertbare Zeichen (nur Emoji/Satzzeichen) fallen auf "quelle" zurück.
 */
export function titelZuSlug(titel: string): string {
  const slug = nfc(titel)
    .toLowerCase()
    .split("")
    .map((c) => DIAKRITIKA[c] ?? c)
    .join("")
    .replace(/[^a-z0-9äöüß]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
  return slug.length > 0 ? slug : "quelle";
}

export function datumPruefen(wert: string, feld: string): string {
  if (!DATUM.test(wert)) {
    throw new Ablehnung(
      "Datumsformat",
      "Alle Datumsangaben sind JJJJ-MM-TT — nur so bleiben Register sortierbar und maschinell prüfbar.",
      `Schreibe ${feld} als JJJJ-MM-TT, z. B. 2026-05-12 statt "12. Mai 2026".`,
    );
  }
  return wert;
}

export function quellenMetaPruefen(meta: QuellenMeta): void {
  for (const [feld, wert] of Object.entries(meta)) {
    if (typeof wert !== "string" || wert.trim() === "") {
      throw new Ablehnung(
        "Pflicht-Frontmatter",
        "Jede Quelle trägt title, author, source_url, date_added, date_published, type — Unbekanntes heißt ausdrücklich \"unbekannt\", wird aber nie weggelassen.",
        `Fülle das Feld "${feld}" — wenn du es nicht weißt, mit dem Wort unbekannt.`,
      );
    }
  }
  datumPruefen(meta.date_added, "date_added");
  if (meta.date_published !== "unbekannt") datumPruefen(meta.date_published, "date_published");
  if (!(TYP_VOKABULAR as readonly string[]).includes(meta.typ)) {
    throw new Ablehnung(
      "type-Vokabular",
      "Für type gilt ein festes Vokabular — freie Wörter machen das Register unsortierbar.",
      `Wähle eines von: ${TYP_VOKABULAR.join(" | ")}.`,
    );
  }
}

/** Alle [[Verweise]] eines Textes. */
export function verweise(text: string): string[] {
  return [...text.matchAll(VERWEIS)].map((m) => m[1].trim());
}

export function artikelPruefen(f: ArtikelFelder, ktx: DoktrinKontext): void {
  slugPruefen(f.slug);
  if (!(STATUS_TRIAS as readonly string[]).includes(f.status)) {
    throw new Ablehnung(
      "Status-Trias",
      "Jeder Artikel trägt seinen Reifegrad — gesichert, im Aufbau oder These. Ohne ihn weiß niemand, wie belastbar das Wissen ist.",
      `Setze status auf genau eines von: ${STATUS_TRIAS.join(" | ")}.`,
    );
  }
  datumPruefen(f.stand, "stand");
  if (f.quellen.length === 0 && f.status !== "These") {
    throw new Ablehnung(
      "Quellenpflicht",
      "Jede Aussage im Wiki muss auf eine RAW-Datei zurückführbar sein — ohne Quelle ist es höchstens eine These.",
      "Nenne mindestens eine RAW-Datei in quellen — oder setze den Status ehrlich auf These.",
    );
  }
  for (const q of f.quellen) {
    if (q.includes("[[")) {
      throw new Ablehnung(
        "Verweis-Doktrin (c)",
        "RAW-Quellen werden als Klartext-Dateiname genannt — sie sind Belege, keine Links; [[Verweise]] gibt es nur zwischen Wiki-Inhalten.",
        `Schreibe den Dateinamen nackt: ${q.replace(/\[|\]/g, "")}`,
      );
    }
    if (!ktx.rawDateien.has(q)) {
      throw new Ablehnung(
        "Quellenpflicht",
        "Eine Quellen-Zeile, die ins Leere zeigt, ist ein unprüfbarer Beleg — genau das soll das System unmöglich machen.",
        `Die Datei "${q}" liegt nicht in RAW/. Nimm die Quelle erst mit quelle_aufnehmen auf oder korrigiere den Namen.`,
      );
    }
  }
  const bekannt = new Set([...ktx.artikelSlugs, f.slug, ...(f.verwandt ?? [])]);
  for (const v of f.verwandt ?? []) {
    if (!ktx.artikelSlugs.has(v) && v !== f.slug) {
      throw new Ablehnung(
        "Verweis-Doktrin (a)",
        "Verweise zeigen auf existierende Artikel — Slug zeichengenau. Ein Verweis auf Nichtexistentes gilt als kaputt.",
        `"${v}" existiert nicht im Wiki. Lege den Artikel zuerst an oder entferne den Verweis.`,
      );
    }
  }
  for (const text of [f.kurzfassung, f.inhalt, ...(f.offene_fragen ?? [])]) {
    for (const v of verweise(text)) {
      if (RAW_DATEINAME.test(v) || RAW_DATEINAME.test(v + ".md") || ktx.rawDateien.has(v) || ktx.rawDateien.has(v + ".md")) {
        throw new Ablehnung(
          "Verweis-Doktrin (b)",
          "[[Verweise]] existieren NUR zwischen Wiki-Inhalten — eine RAW-Datei wird als Klartext-Name zitiert, am Datums-Präfix immer erkennbar.",
          `Nenne die Quelle als Klartext in der quellen-Liste statt als [[${v}]].`,
        );
      }
      if (!bekannt.has(v)) {
        throw new Ablehnung(
          "Verweis-Doktrin (a)",
          "Jeder [[Verweis]] muss zeichengenau auf einen existierenden Artikel-Slug zeigen — sonst zerfällt das Wiki still.",
          `"[[${v}]]" hat kein Ziel. Existierende Artikel: ${[...ktx.artikelSlugs].slice(0, 10).join(", ") || "(noch keine)"}.`,
        );
      }
    }
  }
}

export function reportPruefen(inhalt: string): void {
  const v = verweise(inhalt);
  if (v.length > 0) {
    throw new Ablehnung(
      "Verweis-Doktrin (b) — Outputs",
      "Reports liegen außerhalb des Wikis; [[Verweise]] dort wären für jede maschinelle Prüfung Falschtreffer.",
      `Nenne Artikel als Klartext-Slug (${v[0]} statt [[${v[0]}]]).`,
    );
  }
}

/** Kanonisches Rendering — stabile Reihenfolge, keine rauschenden Diffs. */
export function frontmatterRendern(meta: QuellenMeta & { anonymized?: boolean; asset?: string; geloescht?: string }): string {
  const zeilen = [
    `title: ${meta.titel}`,
    `author: ${meta.autor}`,
    `source_url: ${meta.source_url}`,
    `date_added: ${meta.date_added}`,
    `date_published: ${meta.date_published}`,
    `type: ${meta.typ}`,
  ];
  if (meta.anonymized) zeilen.push("anonymized: true");
  if (meta.asset) zeilen.push(`asset: ${meta.asset}`);
  if (meta.geloescht) zeilen.push(`geloescht: ${meta.geloescht}`);
  return `---\n${zeilen.join("\n")}\n---\n`;
}

export function artikelRendern(f: ArtikelFelder): string {
  const teile = [
    `Status: ${f.status}`,
    `Stand: ${f.stand}`,
    `Quellen: ${f.quellen.join(", ")}`,
    "",
    "## Kurzfassung",
    "",
    f.kurzfassung.trim(),
    "",
    "## Inhalt",
    "",
    f.inhalt.trim(),
  ];
  if (f.verwandt && f.verwandt.length > 0) {
    teile.push("", "## Verwandt", "", f.verwandt.map((v) => `- [[${v}]]`).join("\n"));
  }
  if (f.offene_fragen && f.offene_fragen.length > 0) {
    teile.push("", "## Offene Fragen", "", f.offene_fragen.map((q) => `- ${q.trim()}`).join("\n"));
  }
  return teile.join("\n") + "\n";
}

export function indexZeile(slug: string, beschreibung: string): string {
  return `- [[${slug}]] — ${beschreibung.trim()}`;
}

export function kurzform(frage: string): string {
  const stop = new Set(["der","die","das","ein","eine","und","oder","ich","bei","mit","für","von","wie","was","wo","wann","ist","sind","mir","mich","meine","meinem","meiner","an","in","auf","zu","den","dem","des"]);
  const woerter = nfc(frage)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stop.has(w));
  return (woerter.slice(0, 3).join("-") || "frage");
}

// ── Workspace-Prüfung (deterministischer Gesundheits-Check = kb-lint-Kern) ──

export interface PruefBefund {
  fehler: string[];
  warnungen: string[];
}

export interface WorkspaceDateien {
  /** relativer Pfad → Inhalt; nur .md unterhalb von RAW/, Wiki/, Outputs/ plus AGENTS.md, CHANGELOG.md */
  dateien: Map<string, string>;
}

export function workspacePruefen(ws: WorkspaceDateien): PruefBefund {
  const fehler: string[] = [];
  const warnungen: string[] = [];
  const d = ws.dateien;

  for (const pflicht of ["AGENTS.md", "CHANGELOG.md", "RAW/_INGESTED.md", "Wiki/INDEX.md", "Wiki/QUESTIONS.md"]) {
    if (!d.has(pflicht)) fehler.push(`${pflicht} fehlt`);
  }

  const rawDateien = [...d.keys()].filter((p) => p.startsWith("RAW/") && p.endsWith(".md") && p !== "RAW/_INGESTED.md").map((p) => p.slice(4));
  const artikel = [...d.keys()].filter((p) => p.startsWith("Wiki/") && p.endsWith(".md") && !["Wiki/INDEX.md", "Wiki/QUESTIONS.md"].includes(p)).map((p) => p.slice(5, -3));
  const slugs = new Set(artikel);
  const rawSet = new Set(rawDateien);

  for (const rf of rawDateien) {
    if (!RAW_DATEINAME.test(nfc(rf).toLowerCase()) && !/^\d{4}-\d{2}-\d{2}_.+\.md$/.test(rf)) {
      fehler.push(`RAW/${rf}: Dateiname ohne Datums-Präfix (JJJJ-MM-TT_titel.md)`);
    }
    const txt = d.get("RAW/" + rf)!;
    for (const feld of ["title", "author", "source_url", "date_added", "date_published", "type"]) {
      if (!new RegExp(`^${feld}\\s*:`, "m").test(txt)) fehler.push(`RAW/${rf}: Frontmatter-Feld "${feld}" fehlt`);
    }
  }

  const ingested = d.get("RAW/_INGESTED.md") ?? "";
  if (ingested && !/verarbeitet/i.test(ingested)) fehler.push(`_INGESTED.md: Spalte "verarbeitet" fehlt`);
  for (const rf of rawDateien) if (ingested && !ingested.includes(rf)) fehler.push(`_INGESTED.md: RAW-Datei ${rf} nicht registriert`);

  const TRIAS_RE = /^Status:\s*(These|im Aufbau|gesichert)/m;
  for (const a of artikel) {
    const txt = d.get("Wiki/" + a + ".md")!;
    if (!TRIAS_RE.test(txt)) fehler.push(`Wiki/${a}: keine gültige Status-Trias`);
    if (!/^Quellen\s*:/m.test(txt)) fehler.push(`Wiki/${a}: Quellen-Zeile fehlt`);
    const q = txt.match(/^Quellen\s*:(.+)$/m);
    if (q && q[1].includes("[[")) fehler.push(`Wiki/${a}: Quellen-Zeile enthält [[Verweis]] — verboten`);
    if (q) for (const name of q[1].split(",").map((s) => s.trim()).filter(Boolean)) {
      if (!rawSet.has(name)) warnungen.push(`Wiki/${a}: Quelle "${name}" nicht in RAW/ gefunden`);
    }
    for (const v of verweise(txt)) {
      if (rawSet.has(v) || rawSet.has(v + ".md") || /^\d{4}-\d{2}-\d{2}_/.test(v)) fehler.push(`Wiki/${a}: [[${v}]] zeigt auf eine RAW-Datei`);
      else if (!slugs.has(v)) fehler.push(`Wiki/${a}: kaputter Verweis [[${v}]]`);
    }
  }

  for (const reg of ["Wiki/INDEX.md", "Wiki/QUESTIONS.md"]) {
    const txt = d.get(reg);
    if (!txt) continue;
    for (const v of verweise(txt)) if (!slugs.has(v)) fehler.push(`${reg}: kaputter Verweis [[${v}]]`);
  }
  const idx = d.get("Wiki/INDEX.md") ?? "";
  for (const a of artikel) if (!idx.includes(`[[${a}]]`)) warnungen.push(`INDEX.md: Artikel "${a}" fehlt im Index`);

  for (const p of [...d.keys()].filter((p) => p.startsWith("Outputs/"))) {
    if (verweise(d.get(p)!).length > 0) fehler.push(`${p}: enthält [[Verweis]] — außerhalb des Wikis verboten`);
  }

  return { fehler, warnungen };
}
