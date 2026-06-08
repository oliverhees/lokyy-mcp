#!/usr/bin/env bun
/**
 * MorgenMeldung.ts — der Tagesimpuls (B3b).
 *
 * Läuft morgens, NACH dem Nachtlauf. Bewusst DETERMINISTISCH und ohne LLM:
 * fragt die offenen und die frisch zusammengeführten Bibliothekar-PRs ab und
 * baut daraus EINE kurze Meldung.
 *  - Gab es eine Entscheidungsfrage, ist der PR offen geblieben → er wird hier
 *    mit Link gemeldet ("schau kurz drüber").
 *  - Lief alles glatt (auto-gemergt), gibt es nur einen freundlichen Hinweis.
 *  - Passierte nichts, eine ruhige Meldung — nichts wird beschönigt.
 * Versand über einen Webhook (ntfy / Slack/Discord / eigener Relay). Ohne
 * Webhook landet die Meldung auf stdout (Log). Kein Modell, kein API_KEY.
 *
 * Sicherheit: Der Token wandert ausschließlich in den Authorization-Header;
 * alle Fehlertexte laufen durch saeubern().
 */
import { saeubern } from "../src/gitintegration.ts";

export interface MeldungsKonfiguration {
  forgejo: { url: string; repo: string; token: string };
  heute?: Date;
  webhook?: { url: string; kanal: "ntfy" | "json" };
  fensterStunden?: number; // wie weit zurück gilt ein Merge als "heute Nacht" (Default 18)
}

interface PullKurz {
  number: number;
  title: string;
  html_url: string;
  head?: { ref?: string };
  merged?: boolean;
  merged_at?: string | null;
}

const istBibliothekar = (p: PullKurz) => (p.head?.ref ?? "").startsWith("librarian/");

export async function morgenMeldung(cfg: MeldungsKonfiguration): Promise<{
  titel: string;
  text: string;
  offen: number;
  uebernommen: number;
  gesendet: boolean;
}> {
  const heute = cfg.heute ?? new Date();
  const base = `${cfg.forgejo.url.replace(/\/$/, "")}/api/v1/repos/${cfg.forgejo.repo}`;
  const kopf = { authorization: `token ${cfg.forgejo.token}` };

  const hole = async (zustand: "open" | "closed"): Promise<PullKurz[]> => {
    const res = await fetch(`${base}/pulls?state=${zustand}&limit=50`, { headers: kopf });
    if (!res.ok) throw new Error(saeubern(`Konnte ${zustand}-PRs nicht lesen (${res.status}): ${(await res.text()).slice(0, 200)}`));
    return (await res.json()) as PullKurz[];
  };

  const offenePRs = (await hole("open")).filter(istBibliothekar);
  const grenze = heute.getTime() - (cfg.fensterStunden ?? 18) * 3_600_000;
  const uebernommenePRs = (await hole("closed")).filter(
    (p) => istBibliothekar(p) && p.merged === true && p.merged_at != null && new Date(p.merged_at).getTime() >= grenze,
  );

  const offen = offenePRs.length;
  const uebernommen = uebernommenePRs.length;

  let titel: string;
  let text: string;
  if (offen > 0) {
    titel = offen === 1 ? "Dein Bibliothekar hat eine Frage" : `Dein Bibliothekar hat ${offen} Fragen`;
    const liste = offenePRs.map((p) => `• ${p.title}\n  ${p.html_url}`).join("\n");
    const dazu = uebernommen > 0 ? `\n\n(${uebernommen} weitere Quelle(n) wurden automatisch übernommen.)` : "";
    text = `Guten Morgen! Heute Nacht gab es etwas zu entscheiden:\n\n${liste}\n\nSchau kurz drüber und führe zusammen, was passt.${dazu}`;
  } else if (uebernommen > 0) {
    titel = "Bibliothekar: alles erledigt";
    text = `Guten Morgen! Heute Nacht hat dein Bibliothekar ${uebernommen} Quelle(n) destilliert und automatisch übernommen. Nichts zu entscheiden. ☕`;
  } else {
    titel = "Bibliothekar: ruhige Nacht";
    text = "Guten Morgen! Heute Nacht gab es nichts zu destillieren — deine Wissensbasis ist auf Stand.";
  }

  let gesendet = false;
  if (cfg.webhook?.url) {
    gesendet = await versende(cfg.webhook, titel, text, offenePRs[0]?.html_url);
  } else {
    console.log(`${titel}\n\n${text}`);
  }
  return { titel, text, offen, uebernommen, gesendet };
}

async function versende(webhook: { url: string; kanal: "ntfy" | "json" }, titel: string, text: string, link?: string): Promise<boolean> {
  try {
    if (webhook.kanal === "ntfy") {
      // ntfy: Nachricht im Body, Titel/Klick-Ziel als Header. Header sind Latin-1,
      // deshalb den Titel auf ASCII reduzieren (Body bleibt UTF-8 mit Umlauten).
      const headers: Record<string, string> = { Title: nurAscii(titel) };
      if (link) headers["Click"] = link;
      const res = await fetch(webhook.url, { method: "POST", headers, body: text });
      return res.ok;
    }
    // generisch (Slack/Discord/eigener Relay): JSON-Hülle
    const res = await fetch(webhook.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ titel, text, link }),
    });
    return res.ok;
  } catch {
    return false; // ein nicht erreichbarer Webhook darf den Job nicht abbrechen
  }
}

function nurAscii(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7e]/g, "");
}

// ── CLI-Einstieg (so ruft die Action ihn auf) ─────────────
if (import.meta.main) {
  if (!process.env.FORGEJO_URL || !process.env.FORGEJO_REPO || !process.env.FORGEJO_TOKEN) {
    console.error("MorgenMeldung verlangt FORGEJO_URL, FORGEJO_REPO und FORGEJO_TOKEN.");
    process.exit(2);
  }
  const webhook = process.env.MELDE_WEBHOOK
    ? { url: process.env.MELDE_WEBHOOK, kanal: (process.env.MELDE_KANAL === "json" ? "json" : "ntfy") as "ntfy" | "json" }
    : undefined;
  morgenMeldung({
    forgejo: { url: process.env.FORGEJO_URL, repo: process.env.FORGEJO_REPO, token: process.env.FORGEJO_TOKEN },
    webhook,
  })
    .then((r) => console.error(`Tagesimpuls: ${r.offen} offen, ${r.uebernommen} übernommen, gesendet=${r.gesendet}`))
    .catch((e) => {
      console.error(saeubern((e as Error).message));
      process.exit(1);
    });
}
