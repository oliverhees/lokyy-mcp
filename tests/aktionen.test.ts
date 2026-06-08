/** B2/B3: Bibliothekar-Adapter (Mock-LLM, deterministisch) und Wochen-Review.
 *  ISC-59..62, 65, 66. Der echte OpenRouter-Durchstich (ISC-63) läuft separat. */
import { describe, expect, test } from "bun:test";
import { execSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { frischeBasis, QUELLE, RAW_NAME, TESTTAG } from "./helfer.ts";
import { bibliothekarLauf } from "../aktionen/Bibliothekar.ts";
import { wochenBericht } from "../aktionen/WochenReview.ts";
import { morgenMeldung } from "../aktionen/MorgenMeldung.ts";
import { veredlerLauf } from "../aktionen/Veredler.ts";

const sh = (cmd: string) => execSync(cmd, { encoding: "utf8", env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
const API_KEY = "mock-key-mit-mehr-als-16-zeichen";

/** Geskripteter OpenAI-kompatibler Endpoint: liefert je Aufruf die nächste Antwort. */
function mockLLM(drehbuch: Array<{ tool?: { name: string; args: Record<string, unknown> }; text?: string }>) {
  let i = 0;
  const dienst = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: async (req) => {
      if (!req.headers.get("authorization")?.includes(API_KEY)) {
        return new Response("unauthorized", { status: 401 });
      }
      const szene = drehbuch[Math.min(i++, drehbuch.length - 1)];
      const message = szene.tool
        ? { role: "assistant", content: null, tool_calls: [{ id: `c${i}`, type: "function", function: { name: szene.tool.name, arguments: JSON.stringify(szene.tool.args) } }] }
        : { role: "assistant", content: szene.text ?? "fertig" };
      return Response.json({ choices: [{ message }] });
    },
  });
  return { url: `http://127.0.0.1:${dienst.port}`, stop: () => dienst.stop(true) };
}

function gitBasis() {
  const basis = frischeBasis();
  sh(`git -C ${basis.kb} init -q -b main && git -C ${basis.kb} -c user.name=t -c user.email=t@t add -A && git -C ${basis.kb} -c user.name=t -c user.email=t@t commit -qm start`);
  return basis;
}

/** Wie gitBasis, zusätzlich ein bare-Remote als origin/main (für den Push im PR-Pfad). */
function gitBasisMitRemote() {
  const basis = gitBasis();
  const bare = mkdtempSync(join(tmpdir(), "lokyy-remote-"));
  sh(`git init -q --bare ${bare}`);
  sh(`git -C ${basis.kb} remote add origin ${bare} && git -C ${basis.kb} push -q -u origin main`);
  return { ...basis, bare };
}

/** Mock-Forgejo-API: nimmt PRs an, protokolliert Merges, liefert PR-Listen. */
function mockForgejo(opts: { open?: unknown[]; closed?: unknown[] } = {}) {
  const erstellt: Record<string, unknown>[] = [];
  const gemergt: number[] = [];
  let zaehler = 0;
  const dienst = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: async (req) => {
      const url = new URL(req.url);
      const p = url.pathname;
      const mergeTreffer = p.match(/\/pulls\/(\d+)\/merge$/);
      if (req.method === "POST" && mergeTreffer) {
        gemergt.push(Number(mergeTreffer[1]));
        return new Response("", { status: 200 });
      }
      if (req.method === "POST" && p.endsWith("/pulls")) {
        const body = (await req.json()) as Record<string, unknown>;
        const number = ++zaehler;
        erstellt.push({ number, ...body });
        return Response.json({ number, html_url: `http://forgejo.test/pr/${number}` });
      }
      if (req.method === "GET" && p.endsWith("/pulls")) {
        const zustand = url.searchParams.get("state");
        return Response.json(zustand === "closed" ? (opts.closed ?? []) : (opts.open ?? []));
      }
      return new Response("not found", { status: 404 });
    },
  });
  return { url: `http://127.0.0.1:${dienst.port}`, erstellt, gemergt, stop: () => dienst.stop(true) };
}

const ARTIKEL_ARG = {
  slug: "Digitaler-Posteingang", status: "im Aufbau", stand: TESTTAG,
  quellen: [RAW_NAME], kurzfassung: "Der Posteingang zuerst.",
  inhalt: "Belege digital empfangen spart Zeit.", beschreibung: "Posteingang als erster Schritt",
};

describe("Bibliothekar-Adapter (ISC-59..62)", () => {
  test("Voller Nachtlauf: destilliert über Werkzeuge, committet, Bilanz wird Report", async () => {
    const basis = gitBasis();
    await basis.w.quelleAufnehmen(QUELLE); // eine unverarbeitete Quelle wartet
    sh(`git -C ${basis.kb} -c user.name=t -c user.email=t@t add -A && git -C ${basis.kb} -c user.name=t -c user.email=t@t commit -qm quelle`);

    const mock = mockLLM([
      { tool: { name: "quelle_lesen", args: { dateiname: RAW_NAME } } },
      { tool: { name: "artikel_schreiben", args: {
        slug: "Digitaler-Posteingang", status: "im Aufbau", stand: TESTTAG,
        quellen: [RAW_NAME], kurzfassung: "Der Posteingang zuerst.",
        inhalt: "Belege digital empfangen spart Zeit.", beschreibung: "Posteingang als erster Schritt",
      } } },
      { tool: { name: "quelle_verarbeitet_markieren", args: { dateiname: RAW_NAME } } },
      { text: "Bilanz: 1 Quelle destilliert zu [Artikel Digitaler-Posteingang]. Struktur sauber. Keine offenen Urteilsfragen." },
    ]);
    try {
      const ergebnis = await bibliothekarLauf({
        repoPfad: basis.kb, baseUrl: mock.url, apiKey: API_KEY, modell: "mock",
        maxSchritte: 8, branch: "librarian/test", log: () => {},
      });
      expect(ergebnis.status).toBe("gearbeitet");
      expect(ergebnis.commits).toBeGreaterThanOrEqual(2); // artikel_schreiben + verarbeitet_markieren (quelle_lesen ist lesend)
      expect(ergebnis.bilanz).toContain("Struktur-Check nach dem Lauf");
      expect(existsSync(join(basis.kb, "Wiki", "Digitaler-Posteingang.md"))).toBe(true);
      expect(sh(`git -C ${basis.kb} branch --show-current`).trim()).toBe("librarian/test");
      expect(readFileSync(join(basis.kb, "RAW", "_INGESTED.md"), "utf8")).toMatch(/\| ja \|/);
    } finally {
      mock.stop();
    }
  });

  test("Nichts zu tun: kein Commit, ehrliche Meldung (ISC-61)", async () => {
    const basis = gitBasis(); // leere, saubere Basis
    const mock = mockLLM([{ text: "NICHTS_ZU_TUN" }]);
    try {
      const ergebnis = await bibliothekarLauf({
        repoPfad: basis.kb, baseUrl: mock.url, apiKey: API_KEY, modell: "mock",
        maxSchritte: 4, branch: "librarian/test", log: () => {},
      });
      expect(ergebnis.status).toBe("nichts-zu-tun");
      expect(ergebnis.commits).toBe(0);
    } finally {
      mock.stop();
    }
  });

  test("Werkzeug-Ablehnung erreicht das Modell als Lehrtext, Lauf stürzt nicht ab", async () => {
    const basis = gitBasis();
    await basis.w.quelleAufnehmen(QUELLE);
    sh(`git -C ${basis.kb} -c user.name=t -c user.email=t@t add -A && git -C ${basis.kb} -c user.name=t -c user.email=t@t commit -qm q`);
    const mock = mockLLM([
      { tool: { name: "artikel_schreiben", args: { slug: "X", status: "im Aufbau", stand: TESTTAG, quellen: ["2026-01-01_fehlt.md"], kurzfassung: "k", inhalt: "i", beschreibung: "b" } } },
      { text: "Verstanden, die Quelle existiert nicht — Bilanz: nichts geschrieben." },
    ]);
    try {
      const ergebnis = await bibliothekarLauf({
        repoPfad: basis.kb, baseUrl: mock.url, apiKey: API_KEY, modell: "mock",
        maxSchritte: 4, branch: "librarian/test", log: () => {},
      });
      expect(ergebnis.status).toBe("gearbeitet"); // Quelle blieb unverarbeitet → kein NICHTS_ZU_TUN
    } finally {
      mock.stop();
    }
  });

  test("ohne API_KEY: klarer Startabbruch; Endpoint-Fehler ohne Key-Leck (ISC-66)", async () => {
    const basis = gitBasis();
    await expect(
      bibliothekarLauf({ repoPfad: basis.kb, baseUrl: "http://127.0.0.1:1", apiKey: "", modell: "m", maxSchritte: 1, log: () => {} }),
    ).rejects.toThrow(/API_KEY fehlt/);

    // Endpoint echot den Authorization-Header zurück — er darf die Antwort nie erreichen.
    const echo = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: async (req) =>
      new Response(`kaputt: ${req.headers.get("authorization")}`, { status: 500 }) });
    try {
      const fehler = await bibliothekarLauf({
        repoPfad: basis.kb, baseUrl: `http://127.0.0.1:${echo.port}`, apiKey: API_KEY, modell: "m", maxSchritte: 1, log: () => {},
      }).catch((e) => (e as Error).message);
      expect(fehler).toContain("Modell-Endpoint antwortet 500");
      expect(fehler).not.toContain(API_KEY);
    } finally {
      echo.stop(true);
    }
  });
});

describe("Auto-Merge & Hybrid (ISC-68..70)", () => {
  function quelleCommitten(basis: ReturnType<typeof gitBasisMitRemote>) {
    sh(`git -C ${basis.kb} -c user.name=t -c user.email=t@t add -A && git -C ${basis.kb} -c user.name=t -c user.email=t@t commit -qm quelle`);
  }

  test("auto + ALLES_KLAR: PR wird selbst zusammengeführt", async () => {
    const basis = gitBasisMitRemote();
    await basis.w.quelleAufnehmen(QUELLE);
    quelleCommitten(basis);
    const fj = mockForgejo();
    const mock = mockLLM([
      { tool: { name: "quelle_lesen", args: { dateiname: RAW_NAME } } },
      { tool: { name: "artikel_schreiben", args: ARTIKEL_ARG } },
      { tool: { name: "quelle_verarbeitet_markieren", args: { dateiname: RAW_NAME } } },
      { text: "Bilanz: 1 Quelle destilliert, Struktur sauber.\nSTATUS: ALLES_KLAR" },
    ]);
    try {
      const e = await bibliothekarLauf({
        repoPfad: basis.kb, baseUrl: mock.url, apiKey: API_KEY, modell: "mock", maxSchritte: 8,
        branch: "librarian/test", forgejo: { url: fj.url, repo: "t/kb", token: "tok" }, log: () => {},
      });
      expect(e.status).toBe("pr-gemergt");
      expect(e.gemergt).toBe(true);
      expect(e.offeneFragen).toBe(false);
      expect(fj.erstellt.length).toBe(1);
      expect(fj.gemergt).toEqual([1]);            // genau dieser PR wurde gemergt
      expect(e.bilanz).not.toContain("STATUS:");  // Schlusszeile aus dem Report getilgt
    } finally { mock.stop(); fj.stop(); }
  });

  test("auto + BRAUCHE_ENTSCHEIDUNG: PR bleibt offen, kein Merge", async () => {
    const basis = gitBasisMitRemote();
    await basis.w.quelleAufnehmen(QUELLE);
    quelleCommitten(basis);
    const fj = mockForgejo();
    const mock = mockLLM([
      { tool: { name: "quelle_lesen", args: { dateiname: RAW_NAME } } },
      { tool: { name: "artikel_schreiben", args: ARTIKEL_ARG } },
      { tool: { name: "quelle_verarbeitet_markieren", args: { dateiname: RAW_NAME } } },
      { text: "Bilanz: destilliert. Offen: zwei widersprüchliche Stände.\nSTATUS: BRAUCHE_ENTSCHEIDUNG" },
    ]);
    try {
      const e = await bibliothekarLauf({
        repoPfad: basis.kb, baseUrl: mock.url, apiKey: API_KEY, modell: "mock", maxSchritte: 8,
        branch: "librarian/test", forgejo: { url: fj.url, repo: "t/kb", token: "tok" }, log: () => {},
      });
      expect(e.status).toBe("pr-erstellt");
      expect(e.gemergt).toBe(false);
      expect(e.offeneFragen).toBe(true);
      expect(fj.gemergt).toEqual([]);                       // nichts auto-gemergt
      expect(e.bilanz).toContain("wartet auf deine Entscheidung");
    } finally { mock.stop(); fj.stop(); }
  });

  test("manuell: auch ohne offene Frage kein Auto-Merge", async () => {
    const basis = gitBasisMitRemote();
    await basis.w.quelleAufnehmen(QUELLE);
    quelleCommitten(basis);
    const fj = mockForgejo();
    const mock = mockLLM([
      { tool: { name: "quelle_lesen", args: { dateiname: RAW_NAME } } },
      { tool: { name: "artikel_schreiben", args: ARTIKEL_ARG } },
      { tool: { name: "quelle_verarbeitet_markieren", args: { dateiname: RAW_NAME } } },
      { text: "Bilanz: erledigt.\nSTATUS: ALLES_KLAR" },
    ]);
    try {
      const e = await bibliothekarLauf({
        repoPfad: basis.kb, baseUrl: mock.url, apiKey: API_KEY, modell: "mock", maxSchritte: 8,
        branch: "librarian/test", mergeModus: "manuell", forgejo: { url: fj.url, repo: "t/kb", token: "tok" }, log: () => {},
      });
      expect(e.status).toBe("pr-erstellt");
      expect(fj.gemergt).toEqual([]);
    } finally { mock.stop(); fj.stop(); }
  });
});

describe("Veredler-Lauf (ISC-84)", () => {
  test("vernetzt zwei Artikel und merged automatisch, Inhalt unangetastet", async () => {
    const basis = gitBasisMitRemote();
    await basis.w.quelleAufnehmen(QUELLE);
    await basis.w.artikelSchreiben({ slug: "Digitaler-Posteingang", status: "im Aufbau", stand: TESTTAG, quellen: [RAW_NAME], kurzfassung: "K.", inhalt: "Inhalt A — bitte unverändert lassen.", beschreibung: "A" });
    await basis.w.artikelSchreiben({ slug: "Beleg-Management", status: "im Aufbau", stand: TESTTAG, quellen: [RAW_NAME], kurzfassung: "K.", inhalt: "Inhalt B.", beschreibung: "B" });
    sh(`git -C ${basis.kb} -c user.name=t -c user.email=t@t add -A && git -C ${basis.kb} -c user.name=t -c user.email=t@t commit -qm artikel`);

    const fj = mockForgejo();
    const mock = mockLLM([
      { tool: { name: "artikel_lesen", args: { slug: "INDEX" } } },
      { tool: { name: "artikel_vernetzen", args: { slug: "Digitaler-Posteingang", verwandt: ["Beleg-Management"], tags: ["digital"] } } },
      { text: "Bilanz: 1 Verweis gesetzt, 1 Tag." },
    ]);
    try {
      const e = await veredlerLauf({
        repoPfad: basis.kb, baseUrl: mock.url, apiKey: API_KEY, modell: "mock", maxSchritte: 6,
        branch: "veredler/test", forgejo: { url: fj.url, repo: "t/kb", token: "tok" }, log: () => {},
      });
      expect(e.status).toBe("pr-gemergt");
      expect(e.gemergt).toBe(true);
      expect(fj.gemergt).toEqual([1]);
      const datei = readFileSync(join(basis.kb, "Wiki", "Digitaler-Posteingang.md"), "utf8");
      expect(datei).toContain("## Verwandt\n\n- [[Beleg-Management]]");
      expect(datei).toContain("Tags: digital");
      expect(datei).toContain("Inhalt A — bitte unverändert lassen."); // Prosa erhalten
    } finally { mock.stop(); fj.stop(); }
  });
});

describe("Tagesimpuls / Morgenmeldung (ISC-71..73)", () => {
  const FJ = (url: string) => ({ url, repo: "t/kb", token: "tok" });
  const MORGEN = new Date("2026-06-08T07:00:00Z");

  test("offener Bibliothekar-PR → Meldung mit Link und Aufforderung", async () => {
    const fj = mockForgejo({
      open: [{ number: 5, title: "Bibliothekar: Nachtlauf 2026-06-08", html_url: "http://forgejo.test/pr/5", head: { ref: "librarian/2026-06-08" } }],
      closed: [],
    });
    try {
      const r = await morgenMeldung({ forgejo: FJ(fj.url), heute: MORGEN });
      expect(r.offen).toBe(1);
      expect(r.titel).toMatch(/Frage/);
      expect(r.text).toContain("http://forgejo.test/pr/5");
    } finally { fj.stop(); }
  });

  test("nur frisch übernommene PRs → freundlicher Hinweis, keine Frage", async () => {
    const fj = mockForgejo({
      open: [],
      closed: [{ number: 4, title: "x", html_url: "y", head: { ref: "librarian/2026-06-08" }, merged: true, merged_at: "2026-06-08T02:10:00Z" }],
    });
    try {
      const r = await morgenMeldung({ forgejo: FJ(fj.url), heute: MORGEN });
      expect(r.offen).toBe(0);
      expect(r.uebernommen).toBe(1);
      expect(r.titel).toMatch(/erledigt/);
    } finally { fj.stop(); }
  });

  test("nichts passiert → ruhige Nacht; alte Merges fallen aus dem Fenster", async () => {
    const fj = mockForgejo({
      open: [],
      closed: [{ number: 1, title: "alt", html_url: "z", head: { ref: "librarian/2026-06-01" }, merged: true, merged_at: "2026-06-01T02:00:00Z" }],
    });
    try {
      const r = await morgenMeldung({ forgejo: FJ(fj.url), heute: MORGEN });
      expect(r.offen).toBe(0);
      expect(r.uebernommen).toBe(0);
      expect(r.titel).toMatch(/ruhige/);
    } finally { fj.stop(); }
  });

  test("Webhook (ntfy) bekommt Body und ASCII-Titel-Header", async () => {
    let titelHeader = "";
    let body = "";
    const hook = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: async (req) => {
      titelHeader = req.headers.get("Title") ?? "";
      body = await req.text();
      return new Response("ok");
    } });
    const fj = mockForgejo({ open: [], closed: [] });
    try {
      const r = await morgenMeldung({ forgejo: FJ(fj.url), heute: MORGEN, webhook: { url: `http://127.0.0.1:${hook.port}`, kanal: "ntfy" } });
      expect(r.gesendet).toBe(true);
      expect(body).toContain("Guten Morgen");
      expect(titelHeader).toMatch(/^[\x20-\x7e]*$/); // reines ASCII (ntfy-Header)
    } finally { hook.stop(true); fj.stop(); }
  });
});

describe("Wochen-Review (ISC-65)", () => {
  test("Bericht ist deterministisch aus Commits/CHANGELOG/Dateien gebaut", async () => {
    const basis = gitBasis();
    await basis.w.quelleAufnehmen(QUELLE);
    await basis.w.artikelSchreiben({
      slug: "Digitaler-Posteingang", status: "im Aufbau", stand: TESTTAG,
      quellen: [RAW_NAME], kurzfassung: "K.", inhalt: "I.", beschreibung: "B",
    });
    sh(`git -C ${basis.kb} -c user.name=t -c user.email=t@t add -A && git -C ${basis.kb} -c user.name=t -c user.email=t@t commit -qm woche`);

    const { titel, text } = wochenBericht({ repoPfad: basis.kb, heute: new Date(`${TESTTAG}T12:00:00Z`) });
    expect(titel).toMatch(/^Weekly Review KW \d+$/);
    expect(text).toContain("neue Quelle");
    expect(text).toContain(RAW_NAME);
    expect(text).toContain("Digitaler-Posteingang");
    expect(text).toContain("Aus dem Changelog");
    // Deterministisch: zweiter Lauf, identischer Text
    expect(wochenBericht({ repoPfad: basis.kb, heute: new Date(`${TESTTAG}T12:00:00Z`) }).text).toBe(text);
  });

  test("stille Woche wird ehrlich gemeldet", () => {
    const basis = gitBasis();
    const { text } = wochenBericht({ repoPfad: basis.kb, heute: new Date("2027-03-01T12:00:00Z") });
    expect(text).toContain("stille Woche");
  });
});

describe("Autonomer Modus — Personendaten verlassen den Server nie (PII-Grenze)", () => {
  const PII = {
    titel: "Mandantenakte Sommer", inhalt: "Frau Kessler aus Berlin, Einkommen 84.000 €, Scheidung läuft.",
    typ: "note" as const, enthaelt_personendaten_dritter: "ja" as const,
    kurzbeschreibung: "Gesprächsnotiz einer Mandantin (anonym)",
  };
  const STUB = `${TESTTAG}_mandantenakte-sommer.md`;

  test("--autonom: quelle_lesen entschlüsselt PII-Stub NICHT", async () => {
    const basis = frischeBasis(); basis.repo.autonom = true;
    await basis.w.quelleAufnehmen(PII);
    const gelesen = basis.w.quelleLesen(STUB);
    expect(gelesen).toContain("NICHT entschlüsselt");
    expect(gelesen).not.toContain("Kessler");
    expect(gelesen).not.toContain("84.000");
  });

  test("ohne --autonom (Mensch am Platz): Entschlüsselung erlaubt", async () => {
    const basis = frischeBasis(); // autonom=false
    await basis.w.quelleAufnehmen(PII);
    expect(basis.w.quelleLesen(STUB)).toContain("Kessler");
  });

  test("--autonom: destillat_auftrag spart PII-Quellen aus, meldet das ehrlich", async () => {
    const basis = frischeBasis(); basis.repo.autonom = true;
    await basis.w.quelleAufnehmen(PII);
    await basis.w.quelleAufnehmen({ ...QUELLE }); // eine normale dazu
    const auftrag = basis.w.destillatAuftrag();
    expect(auftrag).toContain(RAW_NAME);          // normale Quelle gelistet
    expect(auftrag).not.toContain(STUB);          // PII-Quelle nicht gelistet
    expect(auftrag).toContain("personenbezogene Quelle(n) wurden bewusst ausgelassen");
  });

  test("Nachtlauf-Durchstich (Mock): Klartext der PII-Quelle erreicht das Modell nie", async () => {
    const basis = gitBasis(); basis.repo.autonom = true;
    await basis.w.quelleAufnehmen(PII);
    sh(`git -C ${basis.kb} -c user.name=t -c user.email=t@t add -A && git -C ${basis.kb} -c user.name=t -c user.email=t@t commit -qm pii`);

    // Mock-Endpoint protokolliert ALLES, was an "das Modell" geschickt wird.
    let gesehen = "";
    const dienst = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: async (req) => {
      gesehen += await req.text();
      return Response.json({ choices: [{ message: { role: "assistant", content: "NICHTS_ZU_TUN" } }] });
    }});
    try {
      // Der Bibliothekar startet den Server selbst mit --autonom (echter Subprozess).
      await bibliothekarLauf({
        repoPfad: basis.kb, baseUrl: `http://127.0.0.1:${dienst.port}`, apiKey: API_KEY,
        modell: "mock", maxSchritte: 3, branch: "librarian/test", log: () => {},
      });
      expect(gesehen).not.toContain("Kessler");
      expect(gesehen).not.toContain("84.000");
    } finally {
      dienst.stop(true);
    }
  });
});
