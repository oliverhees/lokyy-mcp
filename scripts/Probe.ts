#!/usr/bin/env bun
/**
 * Probe.ts — Selbsttest für Teilnehmer und Setup-Anleitungen:
 * startet den Server als echten stdio-Subprozess, listet die Werkzeuge
 * und fährt einen Gesundheits-Check. `bun scripts/Probe.ts --repo <kb>`
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { join } from "node:path";

const i = Bun.argv.indexOf("--repo");
const repo = i >= 0 ? Bun.argv[i + 1] : undefined;
if (!repo) { console.error("Nutzung: bun scripts/Probe.ts --repo <wissensbasis>"); process.exit(2); }

const client = new Client({ name: "lokyy-probe", version: "1.0.0" });
await client.connect(new StdioClientTransport({
  command: "bun",
  args: [join(import.meta.dir, "..", "src", "index.ts"), "--repo", repo],
}));
const tools = await client.listTools();
console.log(`✓ Verbunden — ${tools.tools.length} Werkzeuge: ${tools.tools.map(t => t.name).join(", ")}`);
const check = await client.callTool({ name: "gesundheits_check", arguments: {} });
console.log((check.content as {text:string}[])[0].text.split("\n")[0]);
await client.close();
