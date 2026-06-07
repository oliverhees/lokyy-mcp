#!/usr/bin/env bun
/**
 * lokyy-mcp — der Bibliothekars-Server des Lokyy OS.
 *
 *   bun src/index.ts --repo <wissensbasis>            # stdio (lokal)
 *   bun src/index.ts --repo <wissensbasis> --http     # Streamable HTTP (remote)
 *
 * Ein Server-Prozess bedient genau EIN Wissensbasis-Repo (ein Repo = ein
 * Schlüssel — die Stufe-3-Weiche). HTTP verlangt LOKYY_TOKEN.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { homedir } from "node:os";
import { join, resolve, dirname, basename } from "node:path";
import { Repo } from "./repo.ts";
import { BlobAblage } from "./loeschmodul.ts";
import { baueServer, VERSION } from "./server.ts";
import { starteHttp } from "./transport-http.ts";

function arg(name: string): string | undefined {
  const i = Bun.argv.indexOf(`--${name}`);
  return i >= 0 ? Bun.argv[i + 1] : undefined;
}
function flagge(name: string): boolean {
  return Bun.argv.includes(`--${name}`);
}

if (flagge("version")) {
  console.log(`lokyy-mcp ${VERSION}`);
  process.exit(0);
}

const repoPfad = arg("repo");
if (!repoPfad) {
  console.error(
    `lokyy-mcp ${VERSION} — der Bibliothekars-Server\n\n` +
      `Nutzung:\n` +
      `  lokyy-mcp --repo <wissensbasis>                stdio-Modus (lokal)\n` +
      `  lokyy-mcp --repo <wissensbasis> --http         HTTP-Modus (LOKYY_TOKEN nötig)\n\n` +
      `Optionen: --port 8788 · --host 127.0.0.1 · --blobs <pfad> · --schluessel <pfad> · --url <öffentliche-url> · --version`,
  );
  process.exit(2);
}

const repo = new Repo(resolve(repoPfad));
const repoName = basename(repo.wurzel);
const blobs = new BlobAblage(
  arg("blobs") ?? join(dirname(repo.wurzel), ".lokyy-blobs", repoName),
  arg("schluessel") ?? join(homedir(), ".lokyy", "schluessel.json"),
);
if (flagge("http")) {
  const { url } = await starteHttp(() => baueServer(repo, blobs), {
    port: Number(arg("port") ?? 8788),
    host: arg("host"),
    token: process.env.LOKYY_TOKEN ?? "",
    oeffentlicheUrl: arg("url"),
  });
  console.error(`lokyy-mcp ${VERSION} bedient ${repoName} auf ${url} (Auth: Bearer)`);
} else {
  await baueServer(repo, blobs).connect(new StdioServerTransport());
  console.error(`lokyy-mcp ${VERSION} bedient ${repoName} über stdio`);
}
