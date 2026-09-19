import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { Bot } from "grammy";
import { config } from "./config.js";
import { handleClickCallback, type ClickRequest } from "./payments/click.js";
import { getUser } from "./db/repo.js";
import { t } from "./bot/i18n.js";
import type { Ctx } from "./bot/index.js";

/**
 * Click calls Prepare and then Complete on these two paths. Everything else
 * the bot does runs over long polling, so this server exists only for them
 * and for the platform health check.
 */
export function createHttpServer(bot: Bot<Ctx>) {
  return createServer((req, res) => {
    void route(req, res, bot).catch((err) => {
      console.error("http error", err);
      json(res, 500, { error: "internal error" });
    });
  });
}

async function route(req: IncomingMessage, res: ServerResponse, bot: Bot<Ctx>): Promise<void> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (req.method === "GET" && (url.pathname === "/health" || url.pathname === "/")) {
    json(res, 200, { ok: true });
    return;
  }

  if (req.method === "POST" && (url.pathname === "/click/prepare" || url.pathname === "/click/complete")) {
    const body = await readForm(req);
    const response = await handleClickCallback(body as unknown as ClickRequest, async (tgId, credits) => {
      const user = await getUser(tgId);
      const balance = user?.credits ?? credits;
      await bot.api
        .sendMessage(tgId, t(user?.lang ?? "ru").paid(credits, balance))
        .catch((err) => console.error("could not notify payer", err));
    });
    json(res, 200, response);
    return;
  }

  json(res, 404, { error: "not found" });
}

async function readForm(req: IncomingMessage): Promise<Record<string, string>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > 64 * 1024) throw new Error("payload too large");
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  const type = req.headers["content-type"] ?? "";

  if (type.includes("application/json")) {
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  }
  return Object.fromEntries(new URLSearchParams(raw));
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

export function listenPort(): number {
  return config.port;
}
