/**
 * server.ts — die MCP-Oberfläche: deutsche Werkzeuge + Anweisungs-Kaskade.
 * Eine Ablehnung wird als isError-Tool-Ergebnis zurückgegeben — der Agent
 * liest Regel, Grund und Korrekturweg und kann sich selbst korrigieren.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { Repo } from "./repo.ts";
import { GitSchicht } from "./gitintegration.ts";
import { BlobAblage } from "./loeschmodul.ts";
import { Werkzeuge } from "./werkzeuge.ts";
import { Ablehnung, STATUS_TRIAS, TYP_VOKABULAR } from "./texte.ts";

export const VERSION = "1.3.0";
const ANWEISUNGEN = join(import.meta.dir, "..", "anweisungen");

type ToolErgebnis = { content: { type: "text"; text: string }[]; isError?: boolean };

async function sicher(fn: () => string | Promise<string>): Promise<ToolErgebnis> {
  try {
    return { content: [{ type: "text", text: await fn() }] };
  } catch (e) {
    if (e instanceof Ablehnung) {
      return { content: [{ type: "text", text: e.message }], isError: true };
    }
    throw e;
  }
}

export function baueServer(repo: Repo, blobs: BlobAblage, git?: GitSchicht): McpServer {
  const w = new Werkzeuge(repo, blobs, git);
  const server = new McpServer({ name: "lokyy-mcp", version: VERSION });

  server.registerTool(
    "quelle_aufnehmen",
    {
      title: "Quelle aufnehmen",
      description:
        "Nimmt eine Quelle WÖRTLICH in RAW/ auf (Frontmatter, Register, Changelog automatisch). " +
        "Pflichtangabe: enthält die Quelle personenbezogene Daten Dritter? Bei ja wird der Inhalt " +
        "verschlüsselt außerhalb des Repos abgelegt (Blob+Stub, Lösch-Doktrin).",
      inputSchema: {
        titel: z.string().describe("Titel der Quelle"),
        inhalt: z.string().describe("Vollständiger Quelltext — wird byte-treu gespeichert, nichts verschönern"),
        typ: z.enum(TYP_VOKABULAR).describe("Art der Quelle"),
        enthaelt_personendaten_dritter: z
          .enum(["ja", "nein"])
          .describe("Enthält die Quelle Daten schützenswerter Dritter (Kunden, Mandanten, Patienten)? Im Zweifel: ja"),
        kurzbeschreibung: z.string().describe("Ein Satz für das Register — bei Personendaten OHNE Personenbezug"),
        autor: z.string().optional().describe('Urheber laut Quelle, sonst weglassen (wird "unbekannt")'),
        herkunft: z.string().optional().describe('Web-Adresse oder "Publikation, JJJJ-MM-TT", sonst weglassen'),
        erscheinungsdatum: z.string().optional().describe("JJJJ-MM-TT laut Quelle, sonst weglassen"),
        anonymisiert: z.boolean().optional().describe("true, wenn der Besitzer einer Anonymisierung zugestimmt hat"),
        ordner: z
          .string()
          .optional()
          .describe('Optionaler RAW-Unterordner zur Ablage, z. B. "transkripte". Ein Ordner mit "_"-Präfix ("_notizen") wird vom Nachtlauf nie destilliert (rohes Archiv).'),
      },
    },
    (a) => sicher(() => w.quelleAufnehmen(a)),
  );

  server.registerTool(
    "quelle_lesen",
    {
      title: "Quelle lesen",
      description: "Liest eine RAW-Quelle. Blob+Stub-Quellen werden zur Laufzeit entschlüsselt; Tombstones werden als gelöscht gemeldet.",
      inputSchema: { dateiname: z.string().describe("RAW-Dateiname, z. B. 2026-05-12_artikel-titel.md") },
    },
    (a) => sicher(() => w.quelleLesen(a.dateiname)),
  );

  server.registerTool(
    "wissensbasis_durchsuchen",
    {
      title: "Wissensbasis durchsuchen",
      description: "Volltextsuche über Wiki (zuerst) und RAW. Liefert Datei, Zeile und Auszug.",
      inputSchema: { suchbegriff: z.string().describe("Suchbegriff, mindestens zwei Zeichen") },
    },
    (a) => sicher(() => w.durchsuchen(a.suchbegriff)),
  );

  server.registerTool(
    "artikel_lesen",
    {
      title: "Artikel lesen",
      description: "Liest einen Wiki-Artikel anhand seines Slugs (zeichengenau).",
      inputSchema: { slug: z.string().describe("Artikel-Slug, z. B. Digitaler-Posteingang") },
    },
    (a) => sicher(() => w.artikelLesen(a.slug)),
  );

  server.registerTool(
    "artikel_schreiben",
    {
      title: "Artikel schreiben",
      description:
        "Legt einen Wiki-Artikel an oder aktualisiert ihn (aktualisieren=true nötig). Der Server rendert das " +
        "kanonische Format selbst und validiert die Doktrin: Status-Trias, Quellenpflicht, Verweis-Doktrin. " +
        "INDEX und CHANGELOG werden automatisch gepflegt.",
      inputSchema: {
        slug: z.string().describe("Titel mit Bindestrichen — wird Dateiname UND Verweis-Text"),
        status: z.enum(STATUS_TRIAS).describe("Reifegrad des Artikels"),
        stand: z.string().describe("JJJJ-MM-TT des Wissensstands"),
        quellen: z.array(z.string()).describe("RAW-Dateinamen als Klartext (keine [[Verweise]])"),
        kurzfassung: z.string().describe("2-4 Sätze Kern des Artikels"),
        inhalt: z.string().describe("Der Artikeltext; [[Verweise]] nur auf existierende Artikel-Slugs"),
        verwandt: z.array(z.string()).optional().describe("Slugs verwandter Artikel"),
        offene_fragen: z.array(z.string()).optional().describe("Offene Fragen dieses Artikels"),
        beschreibung: z.string().describe("Ein-Satz-Beschreibung für die INDEX-Zeile"),
        aktualisieren: z.boolean().optional().describe("true, wenn ein bestehender Artikel bewusst ersetzt wird"),
      },
    },
    (a) => sicher(() => w.artikelSchreiben(a)),
  );

  server.registerTool(
    "destillat_auftrag",
    {
      title: "Destillat-Auftrag holen",
      description: "Listet unverarbeitete Quellen und liefert die Destillier-Anweisung. Die Denkarbeit liegt beim Agenten; der Server validiert die Ergebnisse.",
      inputSchema: {},
    },
    () => sicher(() => w.destillatAuftrag()),
  );

  server.registerTool(
    "quelle_verarbeitet_markieren",
    {
      title: "Quelle als verarbeitet markieren",
      description: "Setzt im Register verarbeitet=ja, nachdem eine Quelle destilliert wurde.",
      inputSchema: { dateiname: z.string().describe("RAW-Dateiname aus dem Register") },
    },
    (a) => sicher(() => w.verarbeitetMarkieren(a.dateiname)),
  );

  server.registerTool(
    "frage_vorbereiten",
    {
      title: "Frage vorbereiten",
      description:
        "Bereitet die Beantwortung einer Frage vor: warnt bei unverarbeitetem RAW, liefert Suchtreffer, " +
        "Report-Namensvorgabe und die Report-Regeln. Antworten und formulieren tut der Agent.",
      inputSchema: { frage: z.string().describe("Die Frage des Besitzers") },
    },
    (a) => sicher(() => w.frageVorbereiten(a.frage)),
  );

  server.registerTool(
    "report_ablegen",
    {
      title: "Report ablegen",
      description: "Legt einen Frage-Report nach Outputs/ (Namensschema JJJJ-MM-TT_frage-kurzform.md). Verweigert [[Verweise]] — Reports nutzen Klartext-Namen.",
      inputSchema: {
        frage: z.string().describe("Die beantwortete Frage (wird Überschrift)"),
        inhalt: z.string().describe("Der Report-Inhalt ohne [[Verweise]]"),
        dateiname: z.string().optional().describe("Abweichender Dateiname, sonst automatisch"),
      },
    },
    (a) => sicher(() => w.reportAblegen(a)),
  );

  server.registerTool(
    "gesundheits_check",
    {
      title: "Gesundheits-Check",
      description: "Deterministische Strukturprüfung der ganzen Wissensbasis (Verweise, Register, Frontmatter, Formate). Eine leere Bilanz ist ein gutes Ergebnis.",
      inputSchema: {},
    },
    () => sicher(() => w.gesundheitsCheck()),
  );

  server.registerTool(
    "loeschen_auf_verlangen",
    {
      title: "Löschen auf Verlangen",
      description: "DSGVO-Löschung einer Blob+Stub-Quelle: vernichtet Blob und Schlüssel, der Stub wird Tombstone. Für Klartext-Altfälle gilt nur die dokumentierte Notfallprozedur.",
      inputSchema: { dateiname: z.string().describe("RAW-Dateiname der Stub-Quelle") },
    },
    (a) => sicher(() => w.loeschenAufVerlangen(a.dateiname)),
  );

  // ── Anweisungs-Kaskade als Resources ────────────────────
  server.registerResource(
    "anweisung-basis",
    "lokyy://anweisung/basis",
    { title: "Betriebsanweisung (Basis)", description: "Universelle Bibliothekars-Regeln — für jede Wissensbasis gleich", mimeType: "text/markdown" },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: "text/markdown", text: readFileSync(join(ANWEISUNGEN, "basis.md"), "utf8") }],
    }),
  );

  server.registerResource(
    "anweisung-overlay",
    "lokyy://anweisung/overlay",
    { title: "Overlay dieser Wissensbasis", description: "Thema, Fokus und Eigenheiten — gespeist aus dem AGENTS.md des Repos", mimeType: "text/markdown" },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/markdown",
          text: repo.existiert("AGENTS.md")
            ? repo.lies("AGENTS.md")
            : "Kein Overlay hinterlegt — es gilt die Basis-Anweisung allein.",
        },
      ],
    }),
  );

  for (const [name, datei, titel] of [
    ["bootstrap-workspace", "bootstrap-workspace.md", "Bootstrap-Zeiger (Workspace-Datei)"],
    ["bootstrap-connector", "bootstrap-connector.md", "Bootstrap-Zeiger (Connector-Instruktion)"],
  ] as const) {
    server.registerResource(
      name,
      `lokyy://vorlage/${name}`,
      { title: titel, description: "Vorlage für den minimalen lokalen Zeiger auf die Server-Kaskade", mimeType: "text/markdown" },
      async (uri) => ({
        contents: [{ uri: uri.href, mimeType: "text/markdown", text: readFileSync(join(ANWEISUNGEN, datei), "utf8") }],
      }),
    );
  }

  return server;
}
