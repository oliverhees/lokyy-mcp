# Changelog — lokyy-mcp

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
