# Changelog — lokyy-mcp

## 1.3.0 (2026-06-08) — RAW-Unterordner & "_"-Ausschluss

- **RAW darf Unterordner haben** (`RAW/transkripte/…`): `quelle_aufnehmen` nimmt
  einen optionalen `ordner`-Parameter, das Register trägt den Unterpfad, die
  Suche läuft rekursiv über RAW. Damit bleiben viele Quellen (z. B. Hunderte
  Transkripte) ordentlich sortiert statt flach.
- **"_"-Ordner = Hände weg** (`RAW/_notizen/…`): wird durchsucht, aber vom
  Nachtlauf NIE destilliert und vom `gesundheits_check` NICHT geprüft — der
  Ort für rohes Archiv und freie, eigene Notizen. Der Ordner ist die Anweisung.
- Pfad-Traversal im Ordnernamen wird abgelehnt; der Datums-Dateiname wird am
  Basisnamen geprüft (Unterpfade erlaubt).
- 5 neue Tests (75 gesamt), tsc sauber.

## 1.2.0 (2026-06-08) — Auto-Merge, Hybrid & Tagesimpuls (B3b)

- **Bibliothekar Auto-Merge (Default):** Ein sauberer Nachtlauf wird selbst
  zusammengeführt — alles, was in RAW landet, kommt ohne tägliches Klicken ins
  Brain. Steuerbar über `MERGE_MODUS` (`auto` | `manuell`).
- **Hybrid-Ausnahme:** Hat der Lauf eine echte Entscheidungsfrage, bleibt der PR
  bewusst offen. Signal ist eine deterministische Schlusszeile der Bilanz
  (`STATUS: ALLES_KLAR` / `STATUS: BRAUCHE_ENTSCHEIDUNG`); ein fehlgeschlagener
  Auto-Merge ist nicht fatal (PR bleibt zum manuellen Zusammenführen stehen).
- **Tagesimpuls** (`aktionen/MorgenMeldung.ts` + `morgen-meldung.yml`): morgens
  EINE Meldung — offene Fragen mit Link, sonst freundlicher Hinweis, sonst
  „ruhige Nacht". Deterministisch (kein LLM), Versand per Webhook (ntfy-Default;
  Slack/Discord/Relay via `json`), ohne Webhook ins Log.
- 17 neue Tests (70 gesamt), tsc sauber.

## 1.1.0 (2026-06-07) — die git-Schicht (B1c)

- `--git`: Der Server committet jede Schreiboperation selbst — exakt die
  berührten Dateien, deutsche Ein-Satz-Nachricht, kein add -A, keine
  Leer-Commits. Ohne Flag: kein einziger git-Aufruf.
- Start-Synchronisierung: `pull --rebase`; echter Konflikt bricht den Start
  mit Anleitung ab (Rebase sauber abgebrochen), Netzfehler heißt nur
  „lokal weiterarbeiten" — offline ist kein Konflikt.
- `--push`: optionaler Auto-Push nach jedem Commit; Fehlschläge stehen in der
  Tool-Antwort, nie verschluckt — der nächste erfolgreiche Push nimmt alles mit.
- Härtung: GIT_TERMINAL_PROMPT=0 (kein hängender Prompt), commit.gpgsign=false
  und --no-verify (fremde Configs/Hooks können den Schreibpfad nicht kapern),
  Anmeldedaten werden aus allen Fehlertexten getilgt.
- 12 neue Tests (50 gesamt).

## 1.0.0 (2026-06-07)

Erstes Release. Komplett-Bau in einem Zug (Kern + Lösch-Modul):

- Elf deutsche, deterministische Werkzeuge auf dem Wissensbasis-Repo
- Harte Doktrin-Validierung im Schreibpfad (Slug, Trias, Quellenpflicht,
  Verweis-Doktrin, Datumsformate, Register) — Ablehnungen als Lehrtexte
- Anweisungs-Kaskade als MCP-Resources (Basis + Overlay + Bootstrap-Vorlagen)
- Transporte: stdio und Streamable HTTP (Bearer-Pflicht, 401 + Protected-
  Resource-Metadata, Origin-Schutz, localhost-Default)
- Lösch-Doktrin: AES-256-GCM-Blob außerhalb des Repos, Stub mit asset-ID,
  Tombstone; Löschen vernichtet Blob und Schlüssel
- 35 Tests (Doktrin-Fixtures, Wörtlichkeits-Property, Transport-Identität,
  git-History-Probe, Performance)
