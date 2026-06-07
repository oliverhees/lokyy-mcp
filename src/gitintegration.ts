/**
 * gitintegration.ts — die optionale git-Schicht (v1.1, B1c).
 *
 * Ohne --git existiert diese Schicht nicht: kein einziger git-Aufruf (ISC-55).
 * Mit --git gilt: Der Server committet jede Schreiboperation selbst — genau
 * die Dateien, die die Operation berührt hat (kein add -A: parallele oder
 * fremde Änderungen gehören nicht in den Commit einer Tool-Operation).
 *
 * Robustheits-Entscheidungen (Advisor-verankert):
 * - Commit- und Push-Fehler sind symmetrisch NICHT fatal: Die Datei-Operation
 *   ist die Hauptsache; der Fehler wird der Tool-Antwort angehängt, nie
 *   verschluckt (ISC-57).
 * - pull --rebase nur beim Start: echter Konflikt → rebase --abort und
 *   Startabbruch mit klarer Meldung; reiner Netzfehler → Warnung und
 *   Weiterarbeiten (offline ist kein Konflikt) (ISC-56).
 * - GIT_TERMINAL_PROMPT=0 überall: fehlende Anmeldung schlägt sofort fehl,
 *   statt den Server an einem unsichtbaren Prompt aufzuhängen.
 * - -c commit.gpgsign=false und --no-verify: fremde globale Configs und Hooks
 *   können den Schreibpfad nicht kapern oder einfrieren.
 * - Fehlertexte werden um URL-Anmeldedaten bereinigt (ISC-58) — zusätzlich
 *   zur Doktrin, dass Tokens nie in Remote-URLs gehören (credential helper).
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const IDENTITAET = [
  "-c", "user.name=Lokyy Bibliothekar",
  "-c", "user.email=bibliothekar@lokyy.local",
  "-c", "commit.gpgsign=false",
];

/**
 * Anmeldedaten aus Fehlertexten tilgen, bevor sie in eine Tool-Antwort oder ins
 * Log gelangen (ISC-58). Abgedeckt:
 * - Userinfo in URLs (https://user:pass@host)
 * - Token-/Passwort-Query-Parameter (token, access_token, password, private_token)
 * - Authorization-Header — auch in der Form http.<url>.extraHeader=Authorization:
 *   Basic/Bearer …, wie git sie bei extraHeader-Fehlern ausgibt.
 * SSH-URLs (git@host:…) tragen kein Geheimnis und bleiben absichtlich unberührt.
 */
export function saeubern(text: string): string {
  return text
    .replace(/(https?:\/\/)[^/@\s]+@/g, "$1[anmeldung-entfernt]@")
    .replace(/([?&](?:access_token|token|password|private_token)=)[^&\s"']+/gi, "$1[entfernt]")
    .replace(/(authorization:\s*)\S.*$/gim, "$1[entfernt]")
    // Nackte Schemata ohne Header-Namen (z. B. von Endpoints zurückgeechot):
    .replace(/\b(bearer\s+)[A-Za-z0-9._~+/=-]{16,}/gi, "$1[entfernt]")
    .replace(/\b(token\s+)[A-Za-z0-9._~+/=-]{16,}/gi, "$1[entfernt]");
}

export class GitSchicht {
  constructor(
    private wurzel: string,
    private push: boolean,
  ) {}

  private git(args: string[], erlaubeFehler = false): { ok: boolean; text: string } {
    try {
      const out = execFileSync("git", ["-C", this.wurzel, ...IDENTITAET, ...args], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
        timeout: 30_000,
      });
      return { ok: true, text: out };
    } catch (e) {
      const err = e as { stderr?: string; stdout?: string; message: string };
      const text = saeubern([err.stderr, err.stdout, err.message].filter(Boolean).join("\n"));
      if (erlaubeFehler) return { ok: false, text };
      throw new Error(text);
    }
  }

  istRepo(): boolean {
    return existsSync(join(this.wurzel, ".git"));
  }

  /**
   * Läuft gerade ein Rebase? Locale-unabhängiger Wahrheitsbeweis dafür, dass
   * ein fehlgeschlagenes `pull --rebase` an einem Inhaltskonflikt scheiterte
   * (und nicht an Netz/Auth): git legt diese Verzeichnisse nur an, wenn das
   * Anwenden der Commits begonnen hat. Ein Netzfehler bricht vorher ab.
   */
  private rebaseLaeuft(): boolean {
    return (
      existsSync(join(this.wurzel, ".git", "rebase-merge")) ||
      existsSync(join(this.wurzel, ".git", "rebase-apply"))
    );
  }

  /**
   * Start-Synchronisierung (ISC-56). Liefert eine Statuszeile fürs Log.
   * Echter Rebase-Konflikt → Error (Start bricht ab); Netz-/Remote-Probleme →
   * Warnung, der Server arbeitet lokal weiter.
   */
  beimStart(): string {
    if (!this.istRepo()) {
      throw new Error(
        "git-Modus verlangt ein versioniertes Wissensbasis-Repo — dieses Verzeichnis ist keines. " +
          "Versioniere die Wissensbasis zuerst (Modul 2, Lektion 2.2 / Prompt 13).",
      );
    }
    const status = this.git(["status", "--porcelain"], true);
    if (status.ok && status.text.trim() !== "") {
      // Liegengebliebene Änderungen einsammeln, bevor rebase daran scheitert.
      this.git(["add", "-A"], true);
      this.git(["commit", "--no-verify", "-m", "Liegengebliebene Änderungen beim Start eingesammelt"], true);
    }
    const remote = this.git(["remote"], true);
    if (!remote.ok || remote.text.trim() === "") {
      return "git aktiv (kein Remote eingetragen — es wird lokal committet)";
    }
    const pull = this.git(["pull", "--rebase"], true);
    if (pull.ok) return "git aktiv, Stand mit dem Remote abgeglichen (pull --rebase)";

    // Konflikt-Erkennung locale-unabhängig: maßgeblich ist, ob git tatsächlich
    // in einen Rebase gelaufen ist (rebaseLaeuft). Die Regex ist nur eine
    // zusätzliche Absicherung — der Kerntext "KONFLIKT"/"could not apply" ist
    // je nach git-Sprache übersetzt und darf allein nicht entscheiden (sonst
    // würde ein echter Konflikt als Netzfehler durchrutschen → Datenverlust).
    if (this.rebaseLaeuft() || /CONFLICT|KONFLIKT|could not apply|needs merge|unmerged|nicht zusammengeführt/i.test(pull.text)) {
      this.git(["rebase", "--abort"], true); // nie im Mid-Rebase-Zustand zurücklassen
      throw new Error(
        "ABGELEHNT — Start-Synchronisierung\n\n" +
          "Warum: Lokale und entfernte Änderungen widersprechen sich (echter Rebase-Konflikt). " +
          "Stilles Weiterarbeiten würde eine der beiden Seiten verlieren.\n\n" +
          "So geht es richtig: Löse den Konflikt von Hand (oder mit deinem Sparringspartner) " +
          "und starte den Server danach neu. Der angefangene Rebase wurde sauber abgebrochen.\n\n" +
          "Details: " + pull.text.slice(0, 400),
      );
    }
    // Netz-/Auth-/Remote-Probleme: offline ist kein Konflikt.
    return `git aktiv, Remote nicht erreichbar — es wird lokal weitergearbeitet (Abgleich beim nächsten Start). Details: ${pull.text.split("\n")[0]}`;
  }

  /**
   * Eine Schreiboperation committen — exakt die berührten Pfade (ISC-55).
   * Nicht fatal: Liefert einen Anhang für die Tool-Antwort (ISC-57).
   */
  commit(nachricht: string, pfade: string[]): string {
    if (pfade.length === 0) return "";
    const add = this.git(["add", "--", ...pfade], true);
    if (!add.ok) return `\n(git: Vormerken fehlgeschlagen — ${add.text.split("\n")[0]})`;
    const diff = this.git(["diff", "--cached", "--quiet"], true);
    if (diff.ok) return ""; // nichts geändert → kein Leer-Commit
    const commit = this.git(["commit", "--no-verify", "-m", nachricht.replace(/\n/g, " ").slice(0, 200)], true);
    if (!commit.ok) return `\n(git: Commit fehlgeschlagen — ${commit.text.split("\n")[0]})`;
    if (!this.push) return "\n(git: committet)";
    const push = this.git(["push"], true);
    if (!push.ok) {
      return `\n(git: committet, Push fehlgeschlagen — wird beim nächsten erfolgreichen Push mitgenommen. ${push.text.split("\n")[0]})`;
    }
    return "\n(git: committet und übertragen)";
  }
}
