/**
 * Transport-Tests: stdio-Äquivalent (InMemory-Client) und HTTP mit Auth.
 * ISC-32 (Client-Anschluss), ISC-34..37 (HTTP, 401, Identität, kein Auth-Bypass).
 */
import { describe, expect, test, afterAll } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { frischeBasis, QUELLE, RAW_NAME, TESTTAG } from "./helfer.ts";
import { baueServer } from "../src/server.ts";
import { starteHttp } from "../src/transport-http.ts";

const TOKEN = "test-token-mit-mehr-als-16-zeichen";

async function verbundenerClient(basis = frischeBasis()) {
  const server = baueServer(basis.repo, basis.blobs);
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await Promise.all([server.connect(serverT), client.connect(clientT)]);
  return { client, basis };
}

async function toolText(client: Client, name: string, args: Record<string, unknown> = {}) {
  const res = await client.callTool({ name, arguments: args });
  return (res.content as { type: string; text: string }[]).map((c) => c.text).join("\n");
}

/** Identische Werkzeug-Sequenz — für den stdio↔HTTP-Identitätstest (ISC-36). */
async function sequenz(client: Client) {
  await toolText(client, "quelle_aufnehmen", QUELLE as unknown as Record<string, unknown>);
  await toolText(client, "artikel_schreiben", {
    slug: "Digitaler-Posteingang",
    status: "im Aufbau",
    stand: TESTTAG,
    quellen: [RAW_NAME],
    kurzfassung: "Kern.",
    inhalt: "Inhalt mit Substanz.",
    beschreibung: "Posteingang zuerst",
  });
  await toolText(client, "quelle_verarbeitet_markieren", { dateiname: RAW_NAME });
  await toolText(client, "report_ablegen", { frage: "Womit anfangen?", inhalt: "Mit dem Posteingang." });
}

describe("MCP-Oberfläche über Client (ISC-2, 32-äquivalent)", () => {
  test("Tools sind gelistet, deutsch benannt; Aufruf liefert Ergebnis", async () => {
    const { client } = await verbundenerClient();
    const tools = await client.listTools();
    const namen = tools.tools.map((t) => t.name);
    for (const n of [
      "quelle_aufnehmen", "quelle_lesen", "wissensbasis_durchsuchen", "artikel_lesen",
      "artikel_schreiben", "artikel_vernetzen", "notiz_anlegen", "session_speichern",
      "destillat_auftrag", "quelle_verarbeitet_markieren", "frage_vorbereiten",
      "report_ablegen", "gesundheits_check", "loeschen_auf_verlangen",
    ]) expect(namen).toContain(n);
    expect(await toolText(client, "gesundheits_check")).toContain("0 Fehler");
  });

  test("Ablehnung kommt als isError-Ergebnis mit Lehrtext zurück (ISC-25 über MCP)", async () => {
    const { client } = await verbundenerClient();
    const res = await client.callTool({
      name: "artikel_schreiben",
      arguments: {
        slug: "Test", status: "im Aufbau", stand: TESTTAG, quellen: ["2026-01-01_fehlt.md"],
        kurzfassung: "x", inhalt: "y", beschreibung: "z",
      },
    });
    expect(res.isError).toBe(true);
    const text = (res.content as { text: string }[])[0].text;
    expect(text).toContain("ABGELEHNT");
    expect(text).toContain("So geht es richtig");
  });

  test("Kaskaden-Resources liefern Basis + Overlay (ISC-28/29/30)", async () => {
    const { client } = await verbundenerClient();
    const res = await client.listResources();
    const uris = res.resources.map((r) => r.uri);
    expect(uris).toContain("lokyy://anweisung/basis");
    expect(uris).toContain("lokyy://anweisung/overlay");
    expect(uris).toContain("lokyy://vorlage/bootstrap-workspace");
    expect(uris).toContain("lokyy://vorlage/bootstrap-connector");

    const basis = await client.readResource({ uri: "lokyy://anweisung/basis" });
    expect((basis.contents[0] as { text: string }).text).toContain("Verweis-Doktrin");
    const overlay = await client.readResource({ uri: "lokyy://anweisung/overlay" });
    expect((overlay.contents[0] as { text: string }).text).toContain("Steuerkanzlei");
  });
});

describe("HTTP-Transport (ISC-34..37)", () => {
  test("401 ohne Token (mit resource_metadata), 200 mit Token; Origin-Schutz (ISC-35/37)", async () => {
    const basis = frischeBasis();
    const { dienst, url } = await starteHttp(() => baueServer(basis.repo, basis.blobs), { port: 0, token: TOKEN });
    const echteUrl = `http://127.0.0.1:${dienst.port}/mcp`;

    const ohne = await fetch(echteUrl, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: "{}" });
    expect(ohne.status).toBe(401);
    expect(ohne.headers.get("www-authenticate")).toContain("resource_metadata");

    const meta = await fetch(`http://127.0.0.1:${dienst.port}/.well-known/oauth-protected-resource`);
    expect(meta.status).toBe(200);
    expect((await meta.json()).resource).toContain("/mcp");

    const boeseOrigin = await fetch(echteUrl, {
      method: "POST",
      headers: { authorization: `Bearer ${TOKEN}`, origin: "https://angreifer.example", "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: "{}",
    });
    expect(boeseOrigin.status).toBe(403);

    const mit = await fetch(echteUrl, {
      method: "POST",
      headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "t", version: "1" } } }),
    });
    expect(mit.status).toBe(200);
    dienst.stop(true);
  });

  test("HTTP-Modus startet NICHT ohne Token (ISC-37)", async () => {
    const basis = frischeBasis();
    const fabrik = () => baueServer(basis.repo, basis.blobs);
    await expect(starteHttp(fabrik, { port: 0, token: "" })).rejects.toThrow(/NIE ohne Auth/);
    await expect(starteHttp(fabrik, { port: 0, token: "kurz" })).rejects.toThrow(/16 Zeichen/);
  });

  test("Identität: dieselbe Sequenz über InMemory und HTTP → identischer Repo-Zustand (ISC-36)", async () => {
    // Lauf A: InMemory (stdio-äquivalenter Transportweg)
    const a = await verbundenerClient();
    await sequenz(a.client);

    // Lauf B: HTTP mit Bearer
    const basisB = frischeBasis();
    const { dienst } = await starteHttp(() => baueServer(basisB.repo, basisB.blobs), { port: 0, token: TOKEN });
    const { StreamableHTTPClientTransport } = await import("@modelcontextprotocol/sdk/client/streamableHttp.js");
    const clientB = new Client({ name: "http-client", version: "1.0.0" });
    await clientB.connect(
      new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${dienst.port}/mcp`), {
        requestInit: { headers: { authorization: `Bearer ${TOKEN}` } },
      }),
    );
    await sequenz(clientB);
    dienst.stop(true);

    // Byte-Vergleich beider Repos (CHANGELOG/Register/Wiki/Outputs identisch)
    const diff = execSync(`diff -r ${a.basis.kb} ${basisB.kb} && echo IDENTISCH`).toString();
    expect(diff.trim().endsWith("IDENTISCH")).toBe(true);
  });
});

describe("Performance-Probe (ISC-51)", () => {
  test("200 Quellen: Suche < 1 s, Aufnahme < 2 s", async () => {
    const { w } = frischeBasis();
    for (let i = 0; i < 200; i++) {
      await w.quelleAufnehmen({ ...QUELLE, titel: `Massentest Quelle ${i}`, inhalt: `Inhalt ${i}: ${"Text ".repeat(200)}` });
    }
    const t1 = performance.now();
    w.durchsuchen("Massentest");
    expect(performance.now() - t1).toBeLessThan(1000);

    const t2 = performance.now();
    await w.quelleAufnehmen({ ...QUELLE, titel: "Die letzte Quelle" });
    expect(performance.now() - t2).toBeLessThan(2000);
  });
});
