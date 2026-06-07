# Demo-Drehbuch: „Der Server lehnt ab" (Lektion 2.4)

Ziel: Der Aha-Moment „Meine Regeln sind keine Bitte mehr, sondern eine
Schranke" — live, in unter zwei Minuten, reproduzierbar mit v1.0.0.

## Vorbereitung
- Frische Wissensbasis (Modul-1-Format) per stdio angeschlossen (README-Schnellstart).
- Eine Quelle ist bereits aufgenommen und destilliert (ein Artikel existiert).

## Ablauf (3 Ablehnungen, je ein Lerneffekt)

1. **Die erfundene Quelle.** Sparringspartner bitten: „Lege einen Artikel an,
   Quelle: 2026-01-01_studie.md" (existiert nicht).
   → Server: ABGELEHNT — Quellenpflicht … „Eine Quellen-Zeile, die ins Leere
   zeigt, ist ein unprüfbarer Beleg". *Lerneffekt: Erfinden geht nicht mehr.*
2. **Der kaputte Verweis.** „Schreib in den Artikel: Siehe [[Gibt-Es-Nicht]]."
   → ABGELEHNT — Verweis-Doktrin (a), mit Liste der existierenden Artikel.
   *Lerneffekt: Das Wiki kann nicht mehr still zerfallen.*
3. **Das falsche Datum.** Quelle mit Erscheinungsdatum „12. Mai 2026" aufnehmen.
   → ABGELEHNT — Datumsformat, mit Vorher/Nachher-Korrektur.
   *Lerneffekt: Der Server erklärt, statt nur zu meckern.*

## Die Pointe (sagen!)
„In Modul 1 stand das alles in der Verfassung — und eine höfliche KI hat sich
daran gehalten. Jetzt KANN sie gar nicht anders. Prompt = weiche Grenze,
Werkzeug = harte Grenze."

## Verifiziert
Alle drei Ablehnungen sind exakt die Fixtures der Testsuite
(tests/werkzeuge.test.ts) — sie funktionieren in jeder v1.0.0-Installation.
