---
project: lokyy-mcp
task: lokyy-mcp v1 komplett bauen (Kern + Lösch-Modul, stdio + HTTP/OAuth)
effort: E4
phase: verify
progress: 63/67
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
- [x] ISC-1: `bun install && bun run build` läuft fehlerfrei; `bun test` existiert und ist grün
- [x] ISC-2: Server startet per `bun lokyy-mcp --repo <pfad>` im stdio-Modus und beantwortet `initialize`
- [x] ISC-3: `--version` gibt eine semantische Version aus; CHANGELOG.md des Servers existiert
- [x] ISC-4: Update-Weg dokumentiert: Teilnehmer aktualisiert mit EINEM Befehl, Daten bleiben unberührt
- [x] ISC-5: README erklärt Installation, Anschluss (Claude Cowork + AIonUI) und beide Transporte auf Laien-Niveau

### Werkzeug-Oberfläche (deterministisch, deutsch)
- [x] ISC-6: `quelle_aufnehmen` speichert wörtlich nach RAW/ mit Pflicht-Frontmatter und Datums-Präfix-Dateinamen
- [x] ISC-7: `quelle_aufnehmen` registriert in `_INGESTED.md` mit allen fünf Spalten, `verarbeitet=nein`
- [x] ISC-8: `quelle_aufnehmen` verlangt den PII-Parameter (enthält_personendaten_dritter: ja/nein) — ohne ihn keine Aufnahme
- [x] ISC-9: `wissensbasis_durchsuchen` findet über Wiki und RAW, liefert Treffer mit Quelle (Datei, Zeile)
- [x] ISC-10: `artikel_lesen` liefert Artikel inkl. Status-Kopf; nicht existierender Slug → klare Fehlermeldung
- [x] ISC-11: `artikel_schreiben` legt Wiki-Artikel an/aktualisiert sie und pflegt INDEX.md im kanonischen Zeilenformat
- [x] ISC-12: `frage_vorbereiten` liefert dem Agenten Wiki-Treffer + RAW-Belege + Report-Namensvorgabe (Denkarbeit bleibt beim Agenten)
- [x] ISC-13: `report_ablegen` schreibt nach Outputs/ mit JJJJ-MM-TT_kurzform-Namen, verweigert `[[Verweise]]` im Report
- [x] ISC-14: `destillat_auftrag` liefert unverarbeitete Quellen + Destillier-Anweisung als Arbeitsauftrag; `quelle_verarbeitet_markieren` setzt das Register auf ja
- [x] ISC-15: `gesundheits_check` liefert den deterministischen Strukturreport (= Lint-Befunde) als Tool-Ergebnis
- [x] ISC-16: Jede Schreiboperation erzeugt den CHANGELOG-Eintrag der Wissensbasis automatisch
- [x] ISC-17: Schreiboperationen sind serialisiert: zwei parallele Aufrufe korrumpieren weder Register noch Index (Test mit Promise.all)

### Regeldurchsetzung (der harte Schreibpfad)
- [x] ISC-18: Artikel ohne gültige Status-Trias-Kopfzeile wird abgelehnt
- [x] ISC-19: Artikel mit kaputtem `[[Verweis]]` (kein Ziel-Slug) wird abgelehnt
- [x] ISC-20: `[[Verweis]]` auf eine RAW-Datei wird abgelehnt (Quellen sind Klartext)
- [x] ISC-21: Quellen-Zeile, die eine nicht existierende RAW-Datei nennt, wird abgelehnt
- [x] ISC-22: RAW-Frontmatter mit fehlendem Pflichtfeld oder type außerhalb des Vokabulars wird abgelehnt
- [x] ISC-23: Datumsangaben außerhalb JJJJ-MM-TT in Frontmatter/Registern werden abgelehnt
- [x] ISC-24: Slug-Doktrin erzwungen: Dateiname = Titel mit Bindestrichen, Verweis-Text zeichengleich
- [x] ISC-25: Jede Ablehnung nennt auf Deutsch: verletzte Regel, Grund der Regel, konkreter Korrekturvorschlag
- [x] ISC-26: Die Validierungslogik ist ein eigenes Modul, das auch LintWorkspace v2 (kb-lint) nutzen kann — eine Quelle, zwei Verbraucher
- [x] ISC-27: Anti: Der Server formuliert NIE Quellentext um — RAW-Schreibpfad ist byte-treu (Roundtrip-Test)

### Anweisungs-Kaskade als Resource
- [x] ISC-28: MCP-Resource `lokyy://anweisung/basis` liefert die universelle Bibliothekars-Anweisung
- [x] ISC-29: MCP-Resource `lokyy://anweisung/overlay` liefert das KB-spezifische Overlay (aus dem Repo-AGENTS.md gespeist)
- [x] ISC-30: Der Bootstrap-Zeiger (3-4 Sätze für Workspace-Datei bzw. Connector-Instruktion) liegt als Vorlage bei
- [x] ISC-31: Kaskaden-Inhalte kommen aus EINER Quelle im Server-Paket — kein doppelt gepflegter Regeltext

### Transporte
- [DEFERRED-VERIFY] ISC-32: stdio-Transport: Anschluss aus Claude Cowork per Konfigurationsdatei funktioniert (dokumentierter Cold-Start-Beleg) → Folge: Modul-2-Testschleife Runde 1 (echter Claude-Cowork-Anschluss); Protokoll-Probe via scripts/Probe.ts bestanden
- [DEFERRED-VERIFY] ISC-33: stdio-Transport: Anschluss aus AIonUI funktioniert (Invarianz-Voraussetzung für Lektion 2.5) → Folge: Modul-2-Testschleife Runde 1 (AIonUI-Anschluss)
- [x] ISC-34: HTTP-Transport (Streamable HTTP) startet per `--http --port N` und besteht denselben Tool-Testlauf wie stdio
- [x] ISC-35: OAuth gemäß MCP-Spec auf dem HTTP-Transport: ohne gültiges Token keine Tool-Calls (401-Probe)
- [x] ISC-36: Identitätstest: dieselbe Tool-Sequenz über stdio und HTTP erzeugt byte-identische Repo-Zustände
- [x] ISC-37: Anti: Der HTTP-Transport ist ohne Auth NIE erreichbar — auch nicht in einer „Dev-Abkürzung"

### Lösch-Modul (G3 — Blob+Stub+Tombstone)
- [x] ISC-38: `quelle_aufnehmen` mit Personendaten-Flag legt den Inhalt als verschlüsselten Blob AUSSERHALB des Repos ab (AES-256-GCM, Schlüsseldatei getrennt)
- [x] ISC-39: Im Repo liegt nur der Stub: Frontmatter + stabile asset-ID + inhaltliche Kurzbeschreibung ohne Personenbezug
- [x] ISC-40: `quelle_lesen` auf einen Stub entschlüsselt zur Laufzeit; ohne Schlüssel → klare Fehlermeldung, kein Absturz
- [x] ISC-41: `loeschen_auf_verlangen` vernichtet Blob UND Schlüsseleintrag und wandelt den Stub in einen Tombstone („gelöscht am …, auf Verlangen")
- [x] ISC-42: Nach Löschung: Suche findet den Inhalt nicht mehr; git-History des Repos enthält nachweislich nie Klartext (Probe über git log -p)
- [x] ISC-43: Tombstones überleben Destillat-Aufträge und Gesundheits-Check ohne Falschbefund
- [x] ISC-44: Notfallprozedur (History-Rewrite für Altfälle) liegt als dokumentierte Anleitung bei — als Ausnahme markiert
- [x] ISC-45: Anti: Kein Tool-Pfad schreibt deklarierte Personendaten in Klartext-RAW, auch nicht bei Folgefehlern (Fehlerpfad-Test)

### git-Integration v1.1 (B1c — beim B6-Bau entdeckt, GEBAUT 2026-06-07)
- [x] ISC-55: `--git`-Flag: jede Schreiboperation erzeugt einen Commit mit deutscher Ein-Satz-Nachricht; ohne Flag keinerlei git-Aufrufe
- [x] ISC-56: Beim Start mit `--git`: `pull --rebase`, bei Konflikt klare Ablehnung statt stillem Weiterarbeiten
- [x] ISC-57: Optionaler Auto-Push (`--push`) nach jedem Commit; Fehlschlag wird gemeldet, nie verschluckt
- [x] ISC-58: Anti: Der Server schreibt nie git-Credentials und zeigt nie Token-Werte in Tool-Antworten

### Aktionen (B2 Bibliothekar + B3 Wochen-Review, 2026-06-07)
- [x] ISC-59: aktionen/Bibliothekar.ts läuft headless: startet lokyy-mcp per stdio (--git), holt Basis+Overlay+Auftrag, führt einen Tool-Loop gegen einen OpenAI-kompatiblen Endpoint (BASE_URL/API_KEY/MODELL; Default openrouter.ai, openrouter/auto), max. Schritte begrenzt
- [x] ISC-60: Vor der Arbeit librarian/JJJJ-MM-TT-Branch; mit FORGEJO_URL/REPO/TOKEN: Push + PR über die Forgejo-API, Health-Report als PR-Beschreibung — ohne diese Variablen reiner Lokal-Lauf mit Log (testbar ohne Server)
- [x] ISC-61: „Nichts zu tun" (keine unverarbeiteten Quellen, Check sauber) → kein Branch-Push, kein PR, ehrliche Meldung, Exit 0
- [x] ISC-62: Deterministischer End-to-End-Test mit Mock-LLM (geskriptete tool_calls): Artikel entsteht über die Werkzeuge, Commits vorhanden, Loop terminiert
- [x] ISC-63: Echter Durchstich gegen OpenRouter bestanden (2026-06-08, nach Abschalten der konto-weiten PII-Guardrail): scripts/Durchstich.ts, MODELL=openrouter/auto → echtes Modell destillierte die Mini-Quelle über die lokyy-Werkzeuge zum Artikel Digitaler-Posteingang, 2 Commits, Gesundheits-Check 0/0, Bilanz als Report
- [x] ISC-64: aktionen/bibliothekar.yml: Nacht-Cron + workflow_dispatch, Secrets ausschließlich als ${{ secrets.* }}, Bun-Setup, lokyy-mcp-Bezug konfigurierbar
- [x] ISC-65: B3: aktionen/WochenReview.ts erzeugt den Montags-Bericht DETERMINISTISCH (Commits/CHANGELOG/neue Dateien der letzten 7 Tage, ohne LLM) und legt ihn mit FORGEJO_* als Issue an — sonst stdout; aktionen/wochen-review.yml dazu
- [x] ISC-66: Anti: API_KEY/Token erscheinen in keinem Log-, Fehler- oder PR-Text (saeubern auf allen Fehlerpfaden; Schlüssel wird nie in Nachrichten-Inhalte gelegt)
- [x] ISC-67: Autonomer Modus (--autonom): quelle_lesen entschlüsselt geschützte Blob+Stub-Quellen NIE, destillat_auftrag spart sie aus; der Bibliothekar erzwingt den Modus — End-to-End-Probe beweist, dass PII-Klartext den Modell-Endpoint nie erreicht

### Qualitätssicherung & Abnahme
- [x] ISC-46: Deterministische Testsuite deckt jeden Tool-Pfad inkl. Fehlerpfade ab (bun test, ohne LLM)
- [x] ISC-47: Property-Test Wörtlichkeit: beliebige Quelltexte (Sonderzeichen, Umbrüche, Bindestriche) überleben den Roundtrip byte-treu
- [x] ISC-48: Ein per Server befüllter Beispiel-Workspace besteht LintWorkspace mit 0 Fehlern / 0 Warnungen
- [DEFERRED-VERIFY] ISC-49: Cold-Start als simulierter Teilnehmer (Petra-Harness, frische Session): Anschluss + Quelle + Ablehnung + Suche ohne Anleitung von außen → Folge: Modul-2-Testschleife Runde 1 (Petra-Harness gegen echten Server)
- [DEFERRED-VERIFY] ISC-50: Die sechs Modul-2-Prompts (14–19) funktionieren wortlautgleich gegen den Server (Prompt-Bibliothek B6-Vorgriff geprüft) → Folge: Baustein B6 — Prompts 13-19 existieren noch nicht
- [x] ISC-51: Performance-Probe: 200 RAW-Dateien, Suche < 1 s, Aufnahme < 2 s (CX22-Klasse)
- [x] ISC-52: Anti: keine Claude-spezifischen Annahmen (Grep auf claude/anthropic im Tool-Verhalten = nur Doku-Erwähnungen)
- [x] ISC-53: Anti: Server schreibt NIE außerhalb von Repo, Blob-Ablage und eigener Konfiguration (Pfad-Traversal-Test)
- [x] ISC-54: Antecedent: Die Ablehnungs-Erlebnisse aus Lektion 2.4 (kaputte Quelle live) sind mit dem ausgelieferten Server reproduzierbar — Demo-Drehbuch liegt bei

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
- 2026-06-07 (Bau): HTTP-Auth v1 = Bearer-Pflicht + 401 mit resource_metadata + Protected-Resource-Endpoint (MCP-Spec-Resource-Server-Baseline, Konstantzeit-Vergleich, localhost-Default, Origin-Schutz); der volle Authorization-Server-Anschluss ist B4-Arbeit und additiv. Advisor-verankert.
- 2026-06-07 (Bau, Forge-Befund): asset-IDs sind bewusst NICHT content-adressiert — zwei PII-Quellen mit identischem Klartext müssen getrennt löschbar sein (content-Hash hätte Löschen der einen die andere mitvernichtet). Abweichung vom Stufe-3-KONZEPT-Wortlaut („asset://{hash}") ist für PII-Assets korrekt; fürs Stufe-3-Binärmodul (Bilder, Dedup erwünscht) neu entscheiden.
- 2026-06-07 (Bau): Stateless-HTTP mit frischem Server+Transport pro Anfrage — der Zustand lebt auf der Platte, nie in der Session (SDK-Vorgabe für stateless, deterministisch korrekt).
- 2026-06-08 (PII-Grenze, Olivers Einwand): Entscheid „Garantie in unserem Code" statt Vendor-Schalter. NEU: Server-Modus --autonom — im Nachtlauf werden Blob+Stub-Quellen (geschützte Personendaten) NIE entschlüsselt und nicht zum Destillieren angeboten; der Bibliothekar erzwingt den Modus. Geschütztes Wissen verlässt den Server nie Richtung Cloud, unabhängig vom Modell/Anbieter (End-to-End-Leak-Test). OpenRouter-PII-Blocker bleibt im Default AUS (zu stumpf: false-positive auf jeden Eigennamen, sogar namenlose Sätze), als optionaler Extra-Gürtel dokumentiert. Olivers Intuition (keine Personendaten in die Cloud) war richtig — die Umsetzung gehört hart in unsere Architektur.
- 2026-06-07 (B2-Durchstich, ECHTER FUND): OpenRouter blockt Anfragen mit Personenbezug hart („Request blocked: PII detected (PERSON, LOCATION)", 403 im 200er-Umschlag) — reproduzierbar mit „Frau Kessler aus Berlin", harmlose Anfragen laufen (auto → gpt-5.5/Azure). Für Wissensbasen der Zielgruppe ist das im Nachtlauf fatal UND zugleich ein Verbündeter der Lösch-Doktrin (keine Personendaten zu Drittanbietern). Konsequenzen: (1) Adapter prüft jetzt das Antwort-Shape und meldet solche Blocks klartext; (2) Konto-Einstellung bei OpenRouter prüfen/abschalten für den Kurs-Default — gehört als Pflicht-Schritt in die B4-Setup-Anleitung; (3) ISC-63 bleibt offen bis zum erfolgreichen Wiederholungslauf.
- 2026-06-07 (B1c-Bau): Exaktes Pfad-Staging statt add -A (Repo verfolgt berührte Pfade je Operation); Identität per -c je Aufruf (user.name+email); GIT_TERMINAL_PROMPT=0, gpgsign=false, --no-verify gegen fremde Configs/Hooks; Commit-/Push-Fehler symmetrisch nicht-fatal mit Meldung in der Tool-Antwort. Forge-Befund gefixt: Konflikt-Erkennung jetzt locale-unabhängig über den Rebase-Zustand (.git/rebase-merge) — die Text-Regex hätte auf deutschem git versagt; saeubern() deckt zusätzlich Authorization-Header und password/private_token-Parameter ab, ssh-URLs bleiben bewusst unberührt.
- 2026-06-07 (Verify): Cross-Vendor-Audit (Cato/GPT-5.4) NICHT möglich — codex CLI nicht installiert; Forge lief offen deklariert auf Opus statt GPT-5.4. Follow-up: Codex installieren, Cato nachholen — bis dahin gilt der adversariale Opus-Pass als Zweitprüfung derselben Familie.
- 2026-06-07 (B6-Bau): Lücke entdeckt — ab dem Umzug (Lektion 2.7) schreibt der Server auf der Server-Kopie, v1.0.0 committet aber nicht; KONZEPT verlangt „Dateioperationen + Commits". → v1.1-Kriterien ISC-55..58 angelegt (B1c), VOR Produktion von Lektion 2.7 zu bauen. Bis dahin gilt die Brücke aus den Prompts: der Sparringspartner committet (P13) und pusht (P15), endend mit P16.
- 2026-06-07: Denk-Tools (destillieren, Artikel entwerfen) sind bewusst KEINE Server-Funktion — der Server liefert Arbeitsaufträge (`destillat_auftrag`, `frage_vorbereiten`) und validiert Ergebnisse; das hält ihn deterministisch testbar und modellagnostisch.
- 2026-06-08 (Olivers First-Principles-Einwand „kein Mensch merged jeden Morgen", v1.2.0): Default-Workflow von Review-Tor auf **Auto-Merge mit Hybrid-Ausnahme** umgestellt (ISC-68..70). Begründung: Bei einem persönlichen Second Brain liegt die Kontrolle NACHHER (lesen/editieren/zurücksetzen — alles versioniert, reversibel, Health-Check, harte PII-Grenze), nicht in einem täglichen Pre-Merge-Gate (Reibungstheater, das niemand macht). Auto = Default (Stufe 1–2); nur bei einer echten Besitzer-Entscheidung (`STATUS: BRAUCHE_ENTSCHEIDUNG` in der Bilanz) bleibt der PR offen. `MERGE_MODUS=manuell` bleibt für Stufe 3 (Team/geteiltes Vault). Fehlgeschlagener Auto-Merge ist nicht-fatal (PR bleibt zum manuellen Mergen stehen). NEU dazu: **Tagesimpuls** (B3b, ISC-71..73) — morgens EINE deterministische Meldung (offene Frage mit Link / freundlicher Hinweis / ruhige Nacht), Versand per Webhook (ntfy-Default, json-Alternative), ohne Webhook ins Log. Das „nicht-destillieren"-Signal wandert nach VORNE (Flag beim Reinlegen in RAW) statt tägliches PR-Ablehnen — sonst käme eine abgelehnte Quelle jede Nacht zurück (offene B-Erweiterung „Status abgelehnt").

- 2026-06-08 (Olivers Frage „kann ich in RAW Unterordner abbilden / Ordner vom Destillieren ausschließen?", v1.3.0): RAW wird **rekursiv** (Unterordner erlaubt, Register trägt Unterpfade, Suche walkt rekursiv) — löst das Volumen-Problem (Hunderte Transkripte flach = unübersichtlich). NEU die **„_"-Ordner-Konvention**: ein Ordnersegment mit `_`-Präfix (`RAW/_notizen/`) wird durchsucht, aber NIE destilliert UND NICHT vom gesundheits_check geprüft — das ist der Ort für rohes Archiv + freie eigene Notizen (die RAW sonst streng validiert: Frontmatter + Datums-Dateiname). Mentalmodell fürs Kursdesign: **„der Ordner ist die Anweisung"** — Wiki = behalten+vernetzen (nie destilliert), RAW/<ordner>/ = verarbeiten, RAW/_<ordner>/ = Hände weg. Spiegelt Olivers Lokyy Brain (`20_notes` direkt vs. `30_captures` roh). OFFEN: **Veredler** (zweiter Lauf, vernetzt Wiki-Artikel + Tags ohne Inhaltsänderung) — braucht ein eigenes nicht-destruktives Server-Tool `artikel_vernetzen` (ändert nur Verwandt-Abschnitt + Tags, Prosa byte-treu) plus eine LLM-Action; eigener Baustein, da literales Matching zu schwach ist (Artikel sind slug-benannt, Prosa ist natürlichsprachig).

- 2026-06-08 (Veredler + Session-Capture, v1.4.0): Zweiter Lauf **Veredler** (B3c) ergänzt den Bibliothekar — er VERNETZT (Querverweise + Tags), destilliert nicht und ändert nie Prosa. Schlüssel ist das nicht-destruktive Tool **`artikel_vernetzen`** (`vernetzungAnwenden` setzt nur Tags-Zeile + `## Verwandt`-Abschnitt neu, Kurzfassung/Inhalt/Offene Fragen byte-treu) — so werden auch handgeschriebene Wiki-Notizen automatisch vernetzt, ohne ihren Inhalt anzutasten (Pendant zum Konsolidierungs-Agenten in Lokyy Brain). Damit ist die Trennung Destillieren↔Vernetzen sauber im Code. Veredler-Action mit Branch+PR+Auto-Merge wie der Bibliothekar (Vernetzung verlustfrei → auto immer gemergt, keine Urteilsfrage). NEU außerdem **`session_speichern`** ("save this session", aus Olivers gefundenem Karpathy-Prompt — das einzige fehlende Element): hält Chat-Kernerkenntnisse als Quelle in `RAW/sessions/` fest (dünne Hülle über quelle_aufnehmen, typ note) → wird nachts destilliert; spiegelt `70_pai/sessions/` im Lokyy Brain. Tags ins Artikel-Format aufgenommen. 13 MCP-Tools, 85 Tests. NICHT übernommen aus dem Prompt (bewusst): raw/pages-Struktur, „wiki nur 3 Dateien"-Regel, Obsidian-Tooling. Für den Kurs zusätzlich die 4-Befehle-Lehre übernehmen: „add this / save this session / what do I know about X / save that". PARKPLATZ B4: lesbare Konventions-Resource (wie `get_vault_conventions`) + Doc-Type-/Ordner-Templates (`00_meta/templates`-Äquivalent) fehlen noch — gehören zum Starter-Template, nicht zum Veredler.

## Verification

- ISC-55: test — Commit je Schreibwerkzeug mit deutscher Nachricht; git show --name-only = exakt die 3 berührten Pfade; ohne Schicht kein .git; Ablehnung erzeugt keinen Commit
- ISC-56: test — Konflikt → ABGELEHNT + kein Mid-Rebase-Zustand (auch unter LC_ALL=de_DE); Remote weg → Warnung, Start läuft; kein Repo → Verweis auf Prompt 13
- ISC-57: test — push=true erreicht das Bare-Remote; Push-Fehler steht in der Antwort, Operation und Commit gelingen trotzdem
- ISC-58: test — saeubern tilgt URL-Userinfo, Token-/Passwort-Parameter, Authorization-Header; SUPERGEHEIM-Probe erreicht die Antwort nicht; ssh-URLs unverändert

- ISC-1: probe — bun test 38/38 grün, bunx tsc --noEmit sauber, bun run build → dist/index.js 1.12 MB
- ISC-2/32-Basis: probe — scripts/Probe.ts startet echten stdio-Subprozess: „✓ Verbunden — 11 Werkzeuge"
- ISC-3: probe — `bun src/index.ts --version` → „lokyy-mcp 1.0.0"; CHANGELOG.md vorhanden
- ISC-6..27: test — Doktrin-Fixtures je Regel (tests/werkzeuge.test.ts), Wörtlichkeits-Property mit 4 Sonderzeichen-Proben byte-treu
- ISC-17: test — 8 parallele Aufnahmen, Register konsistent (Promise.all)
- ISC-28..31: test — Resources basis/overlay/bootstrap über MCP-Client gelesen
- ISC-34..37: test — 401 ohne Token (mit resource_metadata-Header), 403 Fremd-Origin, Start-Verweigerung ohne Token, diff -r beider Transport-Läufe → IDENTISCH
- ISC-38..45: test — Klartext-Grep über Repo = leer, git log -p ohne Klartext, Tombstone-Pfade, getrennte Löschbarkeit identischer Klartexte (Forge-Regression)
- ISC-46..48: test — 38 Tests ohne LLM; per Server befüllter Workspace: workspacePruefen 0/0
- ISC-51: test — 200 Quellen: Suche und Aufnahme unter Budget
- ISC-52: probe — Grep claude/anthropic: nur Doku-Nennungen (CLAUDE.md-Konvention, Connector-Anleitung)
- ISC-53: test — Traversal-Proben über drei Tool-Pfade abgelehnt
- ISC-54: inspection — docs/DEMO-Drehbuch-Ablehnung.md; alle drei Demo-Ablehnungen sind Suite-Fixtures

- ISC-68: test — auto + STATUS:ALLES_KLAR → Status „pr-gemergt", genau der erstellte PR wird über die Merge-API zusammengeführt; STATUS-Zeile aus dem PR-Report getilgt
- ISC-69: test — auto + STATUS:BRAUCHE_ENTSCHEIDUNG → PR bleibt offen (kein Merge-Aufruf), Report trägt den „wartet auf deine Entscheidung"-Hinweis
- ISC-70: test — MERGE_MODUS=manuell → auch ohne offene Frage kein Auto-Merge
- ISC-71: test — Tagesimpuls bei offenem librarian-PR: Titel nennt „Frage", Text enthält die PR-URL
- ISC-72: test — nur frisch (im Fenster) gemergte PRs → „alles erledigt"; alte Merges fallen aus dem Zeitfenster → „ruhige Nacht"
- ISC-73: test — ntfy-Webhook erhält den Body (UTF-8) und einen reinen ASCII-Titel-Header; nicht erreichbarer Webhook bricht den Job nicht ab

- ISC-74: test — `ausgeschlossen()` erkennt nur `_`-Ordnersegmente (nicht Dateien mit `_`)
- ISC-75: test — normaler Unterordner: abgelegt unter RAW/transkripte/, mit Unterpfad registriert, durchsucht, im Destillat-Auftrag, als Artikel-Quelle zitierbar
- ISC-76: test — `_`-Ordner: durchsucht, aber NICHT im Destillat-Auftrag; freie Notiz ohne Frontmatter in `_notizen/` lässt den gesundheits_check sauber (0/0)
- ISC-77: test — Pfad-Traversal im Ordnernamen (`../draussen`) wird abgelehnt

- ISC-78: test — `vernetzungAnwenden` fügt Verwandt-Abschnitt hinzu, lässt Kurzfassung/Inhalt unberührt (auch bei `##` im Fließtext)
- ISC-79: test — Tags-Zeile direkt nach Quellen; vorhandene Tags werden ersetzt; leeres Verwandt-Array entfernt den Abschnitt, Offene Fragen bleibt
- ISC-80: test — `artikel_vernetzen` vernetzt bestehenden Artikel, Inhalt erhalten; vernetzter Artikel besteht den gesundheits_check
- ISC-81: test — `artikel_vernetzen` lehnt Verweis auf nicht existierenden Artikel und Selbstverweis ab
- ISC-82: test — `session_speichern` legt RAW/sessions/-Quelle an, registriert sie als unverarbeitet (Nachtlauf nimmt sie), durchsuchbar; mit Personendaten → Blob+Stub
- ISC-83: test — 13 MCP-Tools gelistet (inkl. artikel_vernetzen, session_speichern)
- ISC-84: test — Veredler-Lauf (Mock-LLM): vernetzt zwei Artikel, Auto-Merge, Prosa unangetastet
