# lokyy-mcp — der Bibliothekars-Server des Lokyy OS

Dieser Server verbindet deine KI mit deiner Wissensbasis — über **semantische
Werkzeuge statt Dateizugriff**. Er setzt die Regeln deiner Wissensbasis hart
durch: Was die Doktrin verletzt, wird nicht gespeichert, sondern freundlich
und auf Deutsch abgelehnt — mit Regel, Grund und Korrekturweg.

**Prompt = weiche Grenze. Werkzeug = harte Grenze.**

## Was er kann

| Werkzeug | Zweck |
|---|---|
| `quelle_aufnehmen` | Quelle WÖRTLICH nach RAW/ (Frontmatter, Register, Changelog automatisch). Fragt verpflichtend nach Personendaten Dritter |
| `quelle_lesen` | RAW-Quelle lesen; verschlüsselte Stubs werden zur Laufzeit entschlüsselt |
| `wissensbasis_durchsuchen` | Volltextsuche, Wiki vor RAW |
| `artikel_lesen` / `artikel_schreiben` | Wiki-Artikel — der Server rendert das kanonische Format und validiert die komplette Doktrin |
| `destillat_auftrag` / `quelle_verarbeitet_markieren` | Der Destillier-Kreislauf: Server liefert den Auftrag, die KI denkt, der Server prüft |
| `frage_vorbereiten` / `report_ablegen` | Frage-Reports nach Outputs/ — mit Frische-Warnung und Namensschema |
| `gesundheits_check` | Deterministische Strukturprüfung der ganzen Wissensbasis |
| `loeschen_auf_verlangen` | DSGVO-Löschung: Blob + Schlüssel vernichtet, Stub wird Tombstone |

Dazu liefert er die **Anweisungs-Kaskade** als Resources: `lokyy://anweisung/basis`
(universelle Regeln) und `lokyy://anweisung/overlay` (deine Wissensbasis) —
lokal bleibt nur ein Drei-Satz-Zeiger (Vorlagen: `lokyy://vorlage/…`).

## Schnellstart (lokal, stdio)

```bash
bun install
bun src/index.ts --repo /pfad/zu/deiner/steuerkanzlei_kb
```

**Claude Cowork** (Konfigurationsdatei des Workspace):

```json
{ "mcpServers": { "lokyy": { "command": "bun", "args": ["/pfad/zu/lokyy-mcp/src/index.ts", "--repo", "/pfad/zu/steuerkanzlei_kb"] } } }
```

**AIonUI:** gleiche Kommando-Zeile unter Einstellungen → MCP-Server eintragen.

## Remote (HTTP) — der Zeilentausch

```bash
export LOKYY_TOKEN=$(openssl rand -hex 24)
bun src/index.ts --repo /pfad/zur/kb --http --port 8788 --url https://kb.example.de
```

- Bindet standardmäßig an `127.0.0.1` (hinter einen Reverse-Proxy mit TLS legen).
- **Ohne `LOKYY_TOKEN` startet der HTTP-Modus nicht.** Jede Anfrage braucht
  `Authorization: Bearer <token>`; ohne kommt 401 mit
  `resource_metadata`-Zeiger (`/.well-known/oauth-protected-resource`).
- Im Werkzeug ändert sich nur die Verbindungszeile — das Vokabular bleibt identisch.

## Ein Server = eine Wissensbasis

Pro Wissensbasis-Repo läuft genau ein Server-Prozess mit genau einem Zugang.
Das ist Absicht: Privates und (später) geteiltes Wissen hängen nie am selben
Schlüssel. Zweite Wissensbasis = zweiter Eintrag mit anderem `--repo`.

## Die Lösch-Garantie (und ihre ehrliche Grenze)

Quellen mit Personendaten Dritter (`enthaelt_personendaten_dritter: ja`)
erreichen das Repo **nie im Klartext**: Sie liegen AES-256-GCM-verschlüsselt
außerhalb (`--blobs`, Standard: `../.lokyy-blobs/<kb>/`), der Schlüsselbund
getrennt davon (`--schluessel`, Standard: `~/.lokyy/schluessel.json`).
Löschen-auf-Verlangen vernichtet Blob und Schlüssel — auch die git-History
enthielt nie Klartext.

**Ehrliche Grenze:** Crypto-Shredding löscht, was dieser Schlüsselbund kennt.
Wer die Schlüsseldatei in Backups kopiert, kopiert Zugriff — sichere sie
bewusst (sie ist klein) und getrennt von den Blobs. Für Klartext-Altfälle aus
der Zeit vor dem Server gilt nur die dokumentierte
[Notfallprozedur](docs/NOTFALL-History-Rewrite.md).

## Aktualisieren

```bash
git -C /pfad/zu/lokyy-mcp pull && bun install
```

Deine Wissensbasis wird dabei nie berührt — Server und Daten sind strikt getrennt.
Version prüfen: `bun src/index.ts --version`. Änderungen: [CHANGELOG.md](CHANGELOG.md).

## Entwicklung

```bash
bun test        # 35 deterministische Tests, ohne LLM
bun run build   # Bundle + Typecheck
```

Die Validierungslogik (`src/validierung.ts`) ist dasselbe Modul, das kb-lint
nutzt — eine Doktrin, zwei Durchsetzungsorte.
