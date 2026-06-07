---
project: lokyy-mcp
task: lokyy-mcp v1 komplett bauen (Kern + Lösch-Modul, stdio + HTTP/OAuth)
effort: E4
phase: observe
progress: 0/54
mode: build
started: 2026-06-07
updated: 2026-06-07
---

# ISA — lokyy-mcp (der Bibliothekars-Server)

## Problem

Modul 2 des Kimiboca-Bootcamps lehrt die geteilte Schnittstelle: Jede KI
(Claude Cowork, AIonUI, später Hermes und die nächtliche Action) spricht über
semantische Tool-Calls mit der Wissensbasis statt direkt mit Dateien. Diese
Software existiert nicht. Ohne sie sind die Lektionen 2.4–2.11 Luftbuchungen,
die Regeldurchsetzung bleibt ein Prompt-Versprechen, und die Lösch-Doktrin
(G3) hat keinen Unterbau. Olivers Entscheid (2026-06-07): direkt KOMPLETT
bauen — Kern UND Lösch-Modul in einem Zug, nicht in zwei Wellen.

## Vision

Ein Teilnehmer schließt den Server mit einer Konfigurationszeile an und merkt
beim Arbeiten keinen Unterschied — bis er eine kaputte Quelle einliefert und
der Server sie freundlich, präzise und auf Deutsch ablehnt. Der Moment, in dem
dieselbe Wissensbasis aus Claude UND AIonUI identisch antwortet, und der
Moment, in dem der Wechsel von lokal auf remote ein Zeilentausch ist — beide
fühlen sich an wie Magie, sind aber Architektur. Oliver kann den Server an
hunderte Teilnehmer geben, ohne Angst vor dem Support-Postfach.

## Out of Scope

- MetaMCP, Namespaces, Endpoints, Team-Repos (dritter Kursteil — Stufe 3)
- Binär-Modul mit Objekt-Speicher/MinIO (Stufe 3; das Lösch-Modul nutzt nur
  die lokale verschlüsselte Blob-Ablage)
- Mehrere Wissensbasen pro Server-Prozess (ein Server = ein Repo, per Design)
- Eigene LLM-Aufrufe im Server — der Server ist deterministisch; Denkarbeit
  (Destillieren, Artikel-Entwürfe) bleibt beim anbindenden Agenten
- Web-UI, Dashboard, Telemetrie
- Die Forgejo-Actions selbst (B2/B3 — eigene Bausteine, nutzen diesen Server)

## Principles

- **Prompt = weiche Grenze, Tool = harte Grenze.** Was die Verfassung
  verspricht, erzwingt der Schreibpfad. Eine Regel, die der Server nicht
  prüfen kann, gehört nicht in seine Verantwortung.
- **Der Server ist deterministisch.** Gleicher Input, gleiches Ergebnis —
  testbar ohne LLM. Alles Urteilende liefert er als Auftrag an den Agenten
  zurück, nie als eigene Entscheidung.
- **Eine Regelquelle.** Die Validierungslogik ist dieselbe wie im
  LintWorkspace — eine Doktrin, zwei Durchsetzungsorte (Lint prüft hinterher,
  Server verhindert vorher).
- **Fehlermeldungen sind Lehrmaterial.** Jede Ablehnung sagt auf Deutsch, was
  verletzt wurde, warum es die Regel gibt und wie es richtig geht — die
  Zielgruppe sind Laien, der Server ist auch Lehrer.
- **Agnostik ist Bauprinzip.** Kein Tool-Name, kein Verhalten darf
  Claude-spezifisch sein; was mit Claude geht, geht mit AIonUI und Hermes.

## Constraints

- TypeScript, bun — keine Ausnahme (Betriebsregel). MCP über das offizielle
  `@modelcontextprotocol/sdk`.
- Zwei Transporte, ein Vokabular: stdio (lokal, Modul-2-Lektion 2.4) und
  Streamable HTTP + OAuth (remote, Lektion 2.7). Der Wechsel ist für den
  Client ein Konfigurations-, nie ein Verhaltensunterschied.
- Ein Server-Prozess bedient genau EIN Wissensbasis-Repo (Stufe-3-Weiche:
  Token-pro-Repo-Modell braucht diese 1:1-Beziehung).
- Schreibvorgänge werden pro Repo serialisiert („eine Theke") — keine
  parallelen Schreib-Races.
- Repo-Layout ist das Modul-1-Format (RAW/, Wiki/, Outputs/, AGENTS.md,
  CHANGELOG.md, Registerformate) — der Server erfindet kein neues Schema.
- Klartext-Personendaten Dritter dürfen den RAW-Schreibpfad NIE erreichen,
  wenn der Aufrufer sie als solche deklariert hat (G3); Blobs liegen
  verschlüsselt AUSSERHALB des Repos.
- Keine Zugangsdaten in Repo-Dateien; Secrets nur per Umgebung/Konfiguration.
- Kein CoWork-Wortlaut; deutsche Erklärsprache, englisches Strukturvokabular.

## Goal

`lokyy-mcp` v1 ist ein installierbarer, versionierter MCP-Server (bun/TS),
der ein Wissensbasis-Repo über semantische deutsche Tools bedient, jede
Schreiboperation gegen die Lokyy-Doktrin validiert, die Anweisungs-Kaskade
als Resource ausliefert, über stdio UND Streamable HTTP+OAuth identisch
funktioniert und die Lösch-Doktrin (Blob+Stub+Tombstone) vollständig
implementiert — belegt durch eine deterministische Testsuite und einen
bestandenen Cold-Start als simulierter Teilnehmer.

## Criteria

### Fundament & Projektform
- [ ] ISC-1: `bun install && bun run build` läuft fehlerfrei; `bun test` existiert und ist grün
- [ ] ISC-2: Server startet per `bun lokyy-mcp --repo <pfad>` im stdio-Modus und beantwortet `initialize`
- [ ] ISC-3: `--version` gibt eine semantische Version aus; CHANGELOG.md des Servers existiert
- [ ] ISC-4: Update-Weg dokumentiert: Teilnehmer aktualisiert mit EINEM Befehl, Daten bleiben unberührt
- [ ] ISC-5: README erklärt Installation, Anschluss (Claude Cowork + AIonUI) und beide Transporte auf Laien-Niveau

### Werkzeug-Oberfläche (deterministisch, deutsch)
- [ ] ISC-6: `quelle_aufnehmen` speichert wörtlich nach RAW/ mit Pflicht-Frontmatter und Datums-Präfix-Dateinamen
- [ ] ISC-7: `quelle_aufnehmen` registriert in `_INGESTED.md` mit allen fünf Spalten, `verarbeitet=nein`
- [ ] ISC-8: `quelle_aufnehmen` verlangt den PII-Parameter (enthält_personendaten_dritter: ja/nein) — ohne ihn keine Aufnahme
- [ ] ISC-9: `wissensbasis_durchsuchen` findet über Wiki und RAW, liefert Treffer mit Quelle (Datei, Zeile)
- [ ] ISC-10: `artikel_lesen` liefert Artikel inkl. Status-Kopf; nicht existierender Slug → klare Fehlermeldung
- [ ] ISC-11: `artikel_schreiben` legt Wiki-Artikel an/aktualisiert sie und pflegt INDEX.md im kanonischen Zeilenformat
- [ ] ISC-12: `frage_vorbereiten` liefert dem Agenten Wiki-Treffer + RAW-Belege + Report-Namensvorgabe (Denkarbeit bleibt beim Agenten)
- [ ] ISC-13: `report_ablegen` schreibt nach Outputs/ mit JJJJ-MM-TT_kurzform-Namen, verweigert `[[Verweise]]` im Report
- [ ] ISC-14: `destillat_auftrag` liefert unverarbeitete Quellen + Destillier-Anweisung als Arbeitsauftrag; `quelle_verarbeitet_markieren` setzt das Register auf ja
- [ ] ISC-15: `gesundheits_check` liefert den deterministischen Strukturreport (= Lint-Befunde) als Tool-Ergebnis
- [ ] ISC-16: Jede Schreiboperation erzeugt den CHANGELOG-Eintrag der Wissensbasis automatisch
- [ ] ISC-17: Schreiboperationen sind serialisiert: zwei parallele Aufrufe korrumpieren weder Register noch Index (Test mit Promise.all)

### Regeldurchsetzung (der harte Schreibpfad)
- [ ] ISC-18: Artikel ohne gültige Status-Trias-Kopfzeile wird abgelehnt
- [ ] ISC-19: Artikel mit kaputtem `[[Verweis]]` (kein Ziel-Slug) wird abgelehnt
- [ ] ISC-20: `[[Verweis]]` auf eine RAW-Datei wird abgelehnt (Quellen sind Klartext)
- [ ] ISC-21: Quellen-Zeile, die eine nicht existierende RAW-Datei nennt, wird abgelehnt
- [ ] ISC-22: RAW-Frontmatter mit fehlendem Pflichtfeld oder type außerhalb des Vokabulars wird abgelehnt
- [ ] ISC-23: Datumsangaben außerhalb JJJJ-MM-TT in Frontmatter/Registern werden abgelehnt
- [ ] ISC-24: Slug-Doktrin erzwungen: Dateiname = Titel mit Bindestrichen, Verweis-Text zeichengleich
- [ ] ISC-25: Jede Ablehnung nennt auf Deutsch: verletzte Regel, Grund der Regel, konkreter Korrekturvorschlag
- [ ] ISC-26: Die Validierungslogik ist ein eigenes Modul, das auch LintWorkspace v2 (kb-lint) nutzen kann — eine Quelle, zwei Verbraucher
- [ ] ISC-27: Anti: Der Server formuliert NIE Quellentext um — RAW-Schreibpfad ist byte-treu (Roundtrip-Test)

### Anweisungs-Kaskade als Resource
- [ ] ISC-28: MCP-Resource `lokyy://anweisung/basis` liefert die universelle Bibliothekars-Anweisung
- [ ] ISC-29: MCP-Resource `lokyy://anweisung/overlay` liefert das KB-spezifische Overlay (aus dem Repo-AGENTS.md gespeist)
- [ ] ISC-30: Der Bootstrap-Zeiger (3-4 Sätze für Workspace-Datei bzw. Connector-Instruktion) liegt als Vorlage bei
- [ ] ISC-31: Kaskaden-Inhalte kommen aus EINER Quelle im Server-Paket — kein doppelt gepflegter Regeltext

### Transporte
- [ ] ISC-32: stdio-Transport: Anschluss aus Claude Cowork per Konfigurationsdatei funktioniert (dokumentierter Cold-Start-Beleg)
- [ ] ISC-33: stdio-Transport: Anschluss aus AIonUI funktioniert (Invarianz-Voraussetzung für Lektion 2.5)
- [ ] ISC-34: HTTP-Transport (Streamable HTTP) startet per `--http --port N` und besteht denselben Tool-Testlauf wie stdio
- [ ] ISC-35: OAuth gemäß MCP-Spec auf dem HTTP-Transport: ohne gültiges Token keine Tool-Calls (401-Probe)
- [ ] ISC-36: Identitätstest: dieselbe Tool-Sequenz über stdio und HTTP erzeugt byte-identische Repo-Zustände
- [ ] ISC-37: Anti: Der HTTP-Transport ist ohne Auth NIE erreichbar — auch nicht in einer „Dev-Abkürzung"

### Lösch-Modul (G3 — Blob+Stub+Tombstone)
- [ ] ISC-38: `quelle_aufnehmen` mit Personendaten-Flag legt den Inhalt als verschlüsselten Blob AUSSERHALB des Repos ab (AES-256-GCM, Schlüsseldatei getrennt)
- [ ] ISC-39: Im Repo liegt nur der Stub: Frontmatter + stabile asset-ID + inhaltliche Kurzbeschreibung ohne Personenbezug
- [ ] ISC-40: `quelle_lesen` auf einen Stub entschlüsselt zur Laufzeit; ohne Schlüssel → klare Fehlermeldung, kein Absturz
- [ ] ISC-41: `loeschen_auf_verlangen` vernichtet Blob UND Schlüsseleintrag und wandelt den Stub in einen Tombstone („gelöscht am …, auf Verlangen")
- [ ] ISC-42: Nach Löschung: Suche findet den Inhalt nicht mehr; git-History des Repos enthält nachweislich nie Klartext (Probe über git log -p)
- [ ] ISC-43: Tombstones überleben Destillat-Aufträge und Gesundheits-Check ohne Falschbefund
- [ ] ISC-44: Notfallprozedur (History-Rewrite für Altfälle) liegt als dokumentierte Anleitung bei — als Ausnahme markiert
- [ ] ISC-45: Anti: Kein Tool-Pfad schreibt deklarierte Personendaten in Klartext-RAW, auch nicht bei Folgefehlern (Fehlerpfad-Test)

### Qualitätssicherung & Abnahme
- [ ] ISC-46: Deterministische Testsuite deckt jeden Tool-Pfad inkl. Fehlerpfade ab (bun test, ohne LLM)
- [ ] ISC-47: Property-Test Wörtlichkeit: beliebige Quelltexte (Sonderzeichen, Umbrüche, Bindestriche) überleben den Roundtrip byte-treu
- [ ] ISC-48: Ein per Server befüllter Beispiel-Workspace besteht LintWorkspace mit 0 Fehlern / 0 Warnungen
- [ ] ISC-49: Cold-Start als simulierter Teilnehmer (Petra-Harness, frische Session): Anschluss + Quelle + Ablehnung + Suche ohne Anleitung von außen
- [ ] ISC-50: Die sechs Modul-2-Prompts (14–19) funktionieren wortlautgleich gegen den Server (Prompt-Bibliothek B6-Vorgriff geprüft)
- [ ] ISC-51: Performance-Probe: 200 RAW-Dateien, Suche < 1 s, Aufnahme < 2 s (CX22-Klasse)
- [ ] ISC-52: Anti: keine Claude-spezifischen Annahmen (Grep auf claude/anthropic im Tool-Verhalten = nur Doku-Erwähnungen)
- [ ] ISC-53: Anti: Server schreibt NIE außerhalb von Repo, Blob-Ablage und eigener Konfiguration (Pfad-Traversal-Test)
- [ ] ISC-54: Antecedent: Die Ablehnungs-Erlebnisse aus Lektion 2.4 (kaputte Quelle live) sind mit dem ausgelieferten Server reproduzierbar — Demo-Drehbuch liegt bei

## Test Strategy

| isc | type | check | threshold | tool |
|-----|------|-------|-----------|------|
| 1–5 | probe | Build/Test/CLI-Aufrufe | exit 0 | Bash |
| 6–17 | test | bun test je Tool-Pfad | grün | bun test |
| 18–27 | test | Ablehnungs-Fixtures je Regel | jede Regel 1 Fixture | bun test |
| 28–31 | probe | Resource-Abruf per MCP-Client | Inhalt korrekt | Bash/SDK-Client |
| 32–33 | inspection | Cold-Start-Protokoll mit Screenshot/Transkript | dokumentiert | Interceptor/manuell |
| 34–37 | probe | HTTP-Lauf + 401-Probe + Zustandsvergleich | identisch / 401 | curl, diff -r |
| 38–45 | test | Lösch-Pfad-Fixtures inkl. git log -p | kein Klartext | bun test, git |
| 46–54 | test/probe | Suite, Property-Test, Lint, Petra-Lauf, Timing | 0 Fehler, < Budget | bun test, LintWorkspace, Workflow |

## Features

| name | description | satisfies | depends_on | parallelizable |
|------|-------------|-----------|------------|----------------|
| projekt-skelett | bun/TS-Projekt, SDK, CLI, Versionierung | ISC-1..5 | — | nein |
| validierung | Doktrin-Modul (gemeinsame Quelle mit kb-lint v2) | ISC-18..27 | projekt-skelett | nein |
| werkzeuge | die deterministischen Tools auf dem Repo | ISC-6..17 | validierung | teilweise |
| kaskade | Resources + Bootstrap-Vorlagen | ISC-28..31 | projekt-skelett | ja |
| transporte | stdio + Streamable HTTP + OAuth | ISC-32..37 | werkzeuge | nein |
| loesch-modul | Blob-Ablage, Stub, Tombstone, Notfall-Doku | ISC-38..45 | werkzeuge | ja (nach werkzeuge) |
| abnahme | Testsuite, Property-Tests, Cold-Start, Performance | ISC-46..54 | alle | nein |

## Decisions

- 2026-06-07: Oliver entscheidet: v1 wird KOMPLETT gebaut (Kern + Lösch-Modul in einem Zug) statt in zwei Wellen — Begründung: ein Release, ein Update-Weg, die Lösch-Mechanik prägt die Tool-Signaturen (PII-Parameter in quelle_aufnehmen) und soll nicht nachträglich einbrechen.
- 2026-06-07: Teilnehmer bauen den Server NICHT selbst (Sicherheits-/Support-/Update-Argumente); Lektion 2.3 bekommt stattdessen die „Spielzeug-Theke" (Mini-MCP als Bau-Erlebnis), lokyy-mcp wird quelloffen mitgeliefert.
- 2026-06-07: Denk-Tools (destillieren, Artikel entwerfen) sind bewusst KEINE Server-Funktion — der Server liefert Arbeitsaufträge (`destillat_auftrag`, `frage_vorbereiten`) und validiert Ergebnisse; das hält ihn deterministisch testbar und modellagnostisch.
