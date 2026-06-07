/**
 * texte.ts — Ablehnungen sind Lehrmaterial.
 * Jede Regelverletzung nennt: die Regel, ihren Grund, den Korrekturweg.
 */

export class Ablehnung extends Error {
  constructor(
    public readonly regel: string,
    public readonly grund: string,
    public readonly korrektur: string,
  ) {
    super(
      `ABGELEHNT — ${regel}\n\n` +
        `Warum es diese Regel gibt: ${grund}\n\n` +
        `So geht es richtig: ${korrektur}`,
    );
    this.name = "Ablehnung";
  }
}

/** Feste Vokabulare der Doktrin (identisch mit Modul 1). */
export const TYP_VOKABULAR = [
  "article",
  "transcript",
  "note",
  "book-excerpt",
  "email",
  "podcast",
  "other",
] as const;

export const STATUS_TRIAS = ["gesichert", "im Aufbau", "These"] as const;

export const REIFEGRAD_LEGENDE =
  "(Reifegrade: These = vom System vermutet → im Aufbau = vom Besitzer erzählt → gesichert = im Test bewährt)";
