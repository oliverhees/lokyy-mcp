# Notfallprozedur: Klartext-Personendaten aus der git-History entfernen

> AUSNAHME-EINGRIFF — nicht der Alltagsweg. Der Alltagsweg ist, dass
> Personendaten Dritter das Repo nie erreichen (quelle_aufnehmen mit
> enthaelt_personendaten_dritter: ja → Blob+Stub). Diese Prozedur ist für
> Altfälle: Klartext, der VOR dem Server oder an ihm vorbei ins Repo kam.

## Wann (und nur dann)

- Eine Datei mit Klartext-Personendaten liegt in der git-History des
  Wissensbasis-Repos, und eine betroffene Person verlangt Löschung.

## Schritte

1. **Stillstand:** Keine Schreibvorgänge während der Prozedur (Server stoppen,
   Action pausieren).
2. **Sicherung beiseitelegen** (verschlüsselt, getrennt) — für den Fall eines
   Fehlgriffs; nach Abschluss bewusst vernichten.
3. **git-filter-repo** (nie filter-branch):
   ```bash
   pipx install git-filter-repo
   git filter-repo --invert-paths --path RAW/JJJJ-MM-TT_betroffene-datei.md
   ```
4. **Remote überschreiben:** `git push --force --all && git push --force --tags`
   (auf Forgejo ggf. Branch-Schutz vorübergehend lösen).
5. **Alle Klone neu ziehen:** Jeder bestehende Klon enthält die alte History —
   löschen und frisch klonen, auch auf dem Server des Bibliothekars.
6. **Forgejo-Reste:** Alte Pull-Request-Diffs/Archive können Kopien halten —
   im Zweifel Admin-seitig Garbage-Collection anstoßen (`gitea doctor` /
   Repo-Wartung) oder das Repo neu anlegen und pushen.
7. **Protokollieren:** CHANGELOG-Eintrag „History-Rewrite am JJJJ-MM-TT wegen
   Löschverlangen" — das Verlangen selbst nicht inhaltlich wiedergeben.

## Ehrliche Grenzen

Backups, Forks und Kopien außerhalb deiner Kontrolle bleiben unberührt —
History-Rewrite wirkt nur dort, wo du schreiben darfst. Genau deshalb ist
der Blob+Stub-Weg der Standard und dieser hier die Ausnahme.
