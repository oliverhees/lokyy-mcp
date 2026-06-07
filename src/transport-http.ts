/**
 * transport-http.ts — Streamable HTTP mit Auth-Pflicht.
 *
 * Sicherheitsentscheidungen (Advisor-verankert):
 * - Bind-Default 127.0.0.1 — nie versehentlich offen.
 * - Bearer-Pflicht mit Konstantzeit-Vergleich; ohne Token startet der
 *   HTTP-Modus NICHT (es gibt keine "Dev-Abkürzung").
 * - 401 trägt WWW-Authenticate mit resource_metadata-Zeiger; der
 *   /.well-known/oauth-protected-resource-Endpoint macht den späteren
 *   Authorization-Server-Anschluss additiv (MCP-Spec-Baseline).
 * - Origin-Prüfung gegen DNS-Rebinding: Browser-Origins, die nicht zum Host
 *   gehören, werden abgewiesen.
 */
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { timingSafeEqual } from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/** Stateless-Disziplin: pro Anfrage ein frisches Server+Transport-Paar —
 * der Zustand lebt auf der Platte (Repo), nie in der Session. */
export type ServerFabrik = () => McpServer;

export interface HttpOptionen {
  port: number;
  host?: string;
  token: string;
  oeffentlicheUrl?: string;
}

function tokenGueltig(header: string | null, token: string): boolean {
  if (!header || !header.startsWith("Bearer ")) return false;
  const geliefert = Buffer.from(header.slice(7));
  const erwartet = Buffer.from(token);
  if (geliefert.length !== erwartet.length) return false;
  return timingSafeEqual(geliefert, erwartet);
}

export async function starteHttp(fabrik: ServerFabrik | McpServer, opt: HttpOptionen) {
  if (!opt.token || opt.token.length < 16) {
    throw new Error(
      "HTTP-Modus verweigert: LOKYY_TOKEN fehlt oder ist kürzer als 16 Zeichen. " +
        "Der HTTP-Transport ist NIE ohne Auth erreichbar — erzeuge ein Token, z. B.: openssl rand -hex 24",
    );
  }
  const host = opt.host ?? "127.0.0.1";
  const baue: ServerFabrik = typeof fabrik === "function" ? fabrik : () => fabrik;

  const basisUrl = opt.oeffentlicheUrl ?? `http://${host}:${opt.port}`;
  const metadata = {
    resource: `${basisUrl}/mcp`,
    authorization_servers: [] as string[],
    bearer_methods_supported: ["header"],
    resource_documentation: "https://kimiboca.de/lokyy-mcp",
  };

  const dienst = Bun.serve({
    hostname: host,
    port: opt.port,
    fetch: async (req) => {
      const url = new URL(req.url);

      if (url.pathname === "/.well-known/oauth-protected-resource") {
        return Response.json(metadata);
      }
      if (url.pathname !== "/mcp") {
        return new Response("lokyy-mcp: Endpoint ist /mcp", { status: 404 });
      }

      // DNS-Rebinding-Schutz: Browser-Origin muss zum erwarteten Host passen.
      const origin = req.headers.get("origin");
      if (origin) {
        const o = new URL(origin);
        if (o.hostname !== host && o.hostname !== "localhost" && o.hostname !== "127.0.0.1") {
          return new Response("Origin abgewiesen", { status: 403 });
        }
      }

      if (!tokenGueltig(req.headers.get("authorization"), opt.token)) {
        return new Response(JSON.stringify({ error: "unauthorized" }), {
          status: 401,
          headers: {
            "WWW-Authenticate": `Bearer resource_metadata="${basisUrl}/.well-known/oauth-protected-resource"`,
            "Content-Type": "application/json",
          },
        });
      }

      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // stateless — jede Anfrage trägt ihr Token
        enableJsonResponse: true,
      });
      await baue().connect(transport);
      return transport.handleRequest(req);
    },
  });

  return { dienst, url: `http://${host}:${opt.port}/mcp` };
}
