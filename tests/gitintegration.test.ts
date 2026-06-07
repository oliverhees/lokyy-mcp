/** git-Schicht (v1.1, B1c): ISC-55 (Commit je Schreib-Tool, exakte Pfade, ohne Flag kein git),
 *  ISC-56 (pull --rebase, Konflikt ≠ Netzfehler), ISC-57 (Push optional, Fehler gemeldet),
 *  ISC-58 (keine Anmeldedaten in Antworten). */
import { describe, expect, test } from "bun:test";
import { execSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { frischeBasis, QUELLE, RAW_NAME } from "./helfer.ts";
import { GitSchicht, saeubern } from "../src/gitintegration.ts";
import { Werkzeuge } from "../src/werkzeuge.ts";

const sh = (cmd: string) => execSync(cmd, { encoding: "utf8", env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });

function mitGit(push = false) {
  const basis = frischeBasis();
  sh(`git -C ${basis.kb} init -q -b main && git -C ${basis.kb} -c user.name=t -c user.email=t@t add -A && git -C ${basis.kb} -c user.name=t -c user.email=t@t commit -qm start`);
  const git = new GitSchicht(basis.kb, push);
  const w = new Werkzeuge(basis.repo, basis.blobs, git);
  return { ...basis, git, w };
}

describe("ISC-55 — Commit je Schreiboperation, exakte Pfade", () => {
  test("quelle_aufnehmen committet genau RAW-Datei + Register + Changelog, deutsche Nachricht", async () => {
    const { kb, w } = mitGit();
    const meldung = await w.quelleAufnehmen(QUELLE);
    expect(meldung).toContain("(git: committet)");
    const log = sh(`git -C ${kb} log -1 --pretty=%s`);
    expect(log.trim()).toBe(`Quelle aufgenommen: ${RAW_NAME}`);
    const dateien = sh(`git -C ${kb} show --name-only --pretty=format:`).trim().split("\n").sort();
    expect(dateien).toEqual(["CHANGELOG.md", `RAW/${RAW_NAME}`, "RAW/_INGESTED.md"].sort());
  });

  test("abgelehnte Operation erzeugt KEINEN Commit", async () => {
    const { kb, w } = mitGit();
    const vorher = sh(`git -C ${kb} rev-list --count HEAD`).trim();
    await expect(w.quelleAufnehmen({ ...QUELLE, erscheinungsdatum: "12. Mai 2026" })).rejects.toThrow();
    expect(sh(`git -C ${kb} rev-list --count HEAD`).trim()).toBe(vorher);
  });

  test("ohne git-Schicht: kein einziger git-Aufruf, kein .git", async () => {
    const { kb, w } = frischeBasis(); // ohne GitSchicht
    await w.quelleAufnehmen(QUELLE);
    expect(existsSync(join(kb, ".git"))).toBe(false);
  });

  test("alle fünf Schreibwerkzeuge committen (Kreislauf-Probe)", async () => {
    const { kb, w } = mitGit();
    await w.quelleAufnehmen(QUELLE);
    await w.artikelSchreiben({
      slug: "Digitaler-Posteingang", status: "im Aufbau", stand: "2026-06-07",
      quellen: [RAW_NAME], kurzfassung: "K.", inhalt: "I.", beschreibung: "B",
    });
    await w.verarbeitetMarkieren(RAW_NAME);
    await w.reportAblegen({ frage: "F?", inhalt: "A." });
    const log = sh(`git -C ${kb} log --pretty=%s`);
    for (const s of ["Quelle aufgenommen", "Artikel angelegt: Digitaler-Posteingang", "Quelle verarbeitet", "Report abgelegt"]) {
      expect(log).toContain(s);
    }
  });
});

describe("ISC-56 — Start-Synchronisierung", () => {
  function mitRemote() {
    const wurzel = mkdtempSync(join(tmpdir(), "lokyy-git-"));
    const bare = join(wurzel, "remote.git");
    sh(`git init -q --bare -b main ${bare}`);
    const klonA = join(wurzel, "a");
    sh(`git clone -q ${bare} ${klonA} 2>/dev/null || git init -q -b main ${klonA}`);
    writeFileSync(join(klonA, "datei.md"), "Zeile 1\n");
    sh(`git -C ${klonA} -c user.name=a -c user.email=a@a add -A && git -C ${klonA} -c user.name=a -c user.email=a@a commit -qm start`);
    sh(`git -C ${klonA} remote remove origin 2>/dev/null || true; git -C ${klonA} remote add origin ${bare} && git -C ${klonA} push -qu origin main`);
    const klonB = join(wurzel, "b");
    sh(`git clone -q ${bare} ${klonB}`);
    return { wurzel, bare, klonA, klonB };
  }

  test("sauberer Abgleich und Kein-Remote-Fall", () => {
    const { klonB } = mitRemote();
    expect(new GitSchicht(klonB, false).beimStart()).toContain("abgeglichen");

    const ohneRemote = mkdtempSync(join(tmpdir(), "lokyy-lokal-"));
    sh(`git init -q -b main ${ohneRemote}`);
    writeFileSync(join(ohneRemote, "x.md"), "x\n");
    sh(`git -C ${ohneRemote} -c user.name=t -c user.email=t@t add -A && git -C ${ohneRemote} -c user.name=t -c user.email=t@t commit -qm s`);
    expect(new GitSchicht(ohneRemote, false).beimStart()).toContain("kein Remote");
  });

  test("echter Konflikt: klare Ablehnung, Rebase sauber abgebrochen", () => {
    const { klonA, klonB } = mitRemote();
    writeFileSync(join(klonA, "datei.md"), "Zeile 1 — Version A\n");
    sh(`git -C ${klonA} -c user.name=a -c user.email=a@a commit -qam A && git -C ${klonA} push -q`);
    writeFileSync(join(klonB, "datei.md"), "Zeile 1 — Version B\n");
    sh(`git -C ${klonB} -c user.name=b -c user.email=b@b commit -qam B`);
    expect(() => new GitSchicht(klonB, false).beimStart()).toThrow(/Konflikt|ABGELEHNT/);
    expect(existsSync(join(klonB, ".git", "rebase-merge"))).toBe(false); // nicht im Mid-Rebase
    expect(existsSync(join(klonB, ".git", "rebase-apply"))).toBe(false);
  });

  test("Remote weg (Netzfall): Warnung statt Startabbruch", () => {
    const { bare, klonB } = mitRemote();
    rmSync(bare, { recursive: true, force: true });
    const status = new GitSchicht(klonB, false).beimStart();
    expect(status).toContain("Remote nicht erreichbar");
  });

  test("Konflikt wird auch bei voll lokalisiertem git erkannt (kein Falsch-Negativ)", () => {
    // Reproduziert den echten Konflikt unter erzwungener deutscher git-Sprache:
    // Die Kernzeilen heißen dann KONFLIKT/Konnte … nicht anwenden — die
    // Erkennung darf NICHT von der englischen advice-Zeile abhängen.
    const { klonA, klonB } = mitRemote();
    writeFileSync(join(klonA, "datei.md"), "Zeile 1 — Version A\n");
    sh(`git -C ${klonA} -c user.name=a -c user.email=a@a commit -qam A && git -C ${klonA} push -q`);
    writeFileSync(join(klonB, "datei.md"), "Zeile 1 — Version B\n");
    sh(`git -C ${klonB} -c user.name=b -c user.email=b@b commit -qam B`);
    const vorher = process.env.LC_ALL;
    process.env.LC_ALL = "de_DE.UTF-8";
    process.env.LANG = "de_DE.UTF-8";
    try {
      expect(() => new GitSchicht(klonB, false).beimStart()).toThrow(/Konflikt|ABGELEHNT/);
    } finally {
      if (vorher === undefined) delete process.env.LC_ALL;
      else process.env.LC_ALL = vorher;
    }
    // Locale-unabhängiger Beweis: kein Mid-Rebase-Zustand zurückgelassen.
    expect(existsSync(join(klonB, ".git", "rebase-merge"))).toBe(false);
    expect(existsSync(join(klonB, ".git", "rebase-apply"))).toBe(false);
  });

  test("kein git-Repo + --git: klare Anleitung statt Crash", () => {
    const { kb } = frischeBasis();
    expect(() => new GitSchicht(kb, false).beimStart()).toThrow(/Lektion 2.2|Prompt 13/);
  });
});

describe("ISC-57 — Push: optional, Fehler gemeldet, nie verschluckt", () => {
  test("push=true überträgt zum Remote", async () => {
    const wurzel = mkdtempSync(join(tmpdir(), "lokyy-push-"));
    const bare = join(wurzel, "remote.git");
    sh(`git init -q --bare -b main ${bare}`);
    const basis = frischeBasis();
    sh(`git -C ${basis.kb} init -q -b main && git -C ${basis.kb} -c user.name=t -c user.email=t@t add -A && git -C ${basis.kb} -c user.name=t -c user.email=t@t commit -qm start`);
    sh(`git -C ${basis.kb} remote add origin ${bare} && git -C ${basis.kb} push -qu origin main`);
    const w = new Werkzeuge(basis.repo, basis.blobs, new GitSchicht(basis.kb, true));
    const meldung = await w.quelleAufnehmen(QUELLE);
    expect(meldung).toContain("committet und übertragen");
    expect(sh(`git -C ${bare} log -1 --pretty=%s`)).toContain("Quelle aufgenommen");
  });

  test("Push-Fehler: Operation gelingt, Fehler steht in der Antwort", async () => {
    const { kb, repo, blobs } = mitGit();
    sh(`git -C ${kb} remote add origin /tmp/gibt-es-nicht-${Date.now()}.git`);
    const w = new Werkzeuge(repo, blobs, new GitSchicht(kb, true));
    const meldung = await w.quelleAufnehmen(QUELLE);
    expect(meldung).toContain("Aufgenommen: RAW/"); // Hauptsache gelungen
    expect(meldung).toContain("Push fehlgeschlagen");
    expect(sh(`git -C ${kb} log -1 --pretty=%s`)).toContain("Quelle aufgenommen"); // Commit steht
  });
});

describe("ISC-58 — keine Anmeldedaten in Antworten", () => {
  test("saeubern tilgt URL-Userinfo und Token-Parameter", () => {
    expect(saeubern("fatal: https://oliver:geheim123@forgejo.example/x.git failed"))
      .toBe("fatal: https://[anmeldung-entfernt]@forgejo.example/x.git failed");
    expect(saeubern("GET /repo?access_token=abc123&x=1")).toContain("access_token=[entfernt]");
    expect(saeubern("?token=xyz")).toContain("token=[entfernt]");
  });

  test("saeubern tilgt Authorization-Header und extraHeader-Token", () => {
    // Der vom Nutzer benannte Vektor: http.<url>.extraHeader=Authorization: Basic …
    expect(saeubern("error: ...extraheader=Authorization: Basic dXNlcjpwYXNz"))
      .not.toContain("dXNlcjpwYXNz");
    expect(saeubern("send: Authorization: Bearer ghp_SUPERGEHEIM"))
      .not.toContain("ghp_SUPERGEHEIM");
    // Weitere Geheim-Parameter
    expect(saeubern("?password=hunter2")).toContain("password=[entfernt]");
    expect(saeubern("?private_token=glpat-xyz")).toContain("private_token=[entfernt]");
  });

  test("saeubern lässt SSH-URLs unberührt (kein Geheimnis, kein Falsch-Positiv)", () => {
    const ssh = "git@github.com:oliver/kb.git: Permission denied (publickey).";
    expect(saeubern(ssh)).toBe(ssh);
  });

  test("Push-Fehlertext mit Token-URL erreicht die Antwort nur bereinigt", async () => {
    const { kb, repo, blobs } = mitGit();
    sh(`git -C ${kb} remote add origin https://nutzer:SUPERGEHEIM@127.0.0.1:1/kb.git`);
    const w = new Werkzeuge(repo, blobs, new GitSchicht(kb, true));
    const meldung = await w.quelleAufnehmen(QUELLE);
    expect(meldung).toContain("Push fehlgeschlagen");
    expect(meldung).not.toContain("SUPERGEHEIM");
  });
});
