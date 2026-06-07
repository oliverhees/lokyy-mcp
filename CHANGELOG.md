# Changelog — lokyy-mcp

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
