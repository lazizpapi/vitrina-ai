import {
  Bot,
  InlineKeyboard,
  InputFile,
  InputMediaBuilder,
  session,
  type Context,
  type SessionFlavor,
} from "grammy";
import { config } from "../config.js";
import { langFromTelegram, t } from "./i18n.js";
import type { Lang, ProductBrief } from "../generation/brief.js";
import { CARD_ORDER, type CardType } from "../generation/cards.js";
import { HiggsfieldProvider } from "../generation/higgsfield.js";
import { runPack, type CardResult } from "../generation/pipeline.js";
import { applyLedger, claimFreeCard, createOrder, getUser, setLang, upsertUser } from "../db/repo.js";
import { PACKS, isPackCode, type PackCode } from "../packs.js";
import { paymentLink } from "../payments/click.js";
import { creditStarsPayment, orderIdFromPayload, sendStarsInvoice } from "../payments/stars.js";

type Step = "idle" | "title" | "price" | "bullets" | "working";

type SessionData = {
  step: Step;
  fileId?: string;
  /** Distinguishes two packs from the same photo, so the ledger stays idempotent. */
  runId?: string;
  title?: string;
  priceUzs?: number | null;
  bullets?: string[];
};

export type Ctx = Context & SessionFlavor<SessionData>;

const provider = new HiggsfieldProvider();

export function createBot(): Bot<Ctx> {
  const bot = new Bot<Ctx>(config.botToken);

  bot.use(session<SessionData, Ctx>({ initial: (): SessionData => ({ step: "idle" }) }));

  bot.catch((err) => console.error("bot error", err.error));

  bot.command("start", async (ctx) => {
    const lang = langFromTelegram(ctx.from?.language_code);
    const user = await upsertUser(ctx.from!.id, lang, ctx.from?.username);
    const d = t(user.lang);
    ctx.session = { step: "idle" };
    await ctx.reply(d.welcome, { reply_markup: langKeyboard() });
    await ctx.reply(d.askPhoto);
  });

  bot.command("help", (ctx) => withUser(ctx, async (u) => void ctx.reply(t(u.lang).help)));

  bot.command("balance", (ctx) =>
    withUser(ctx, async (u) => void ctx.reply(t(u.lang).balance(u.credits))),
  );

  bot.command("lang", (ctx) =>
    withUser(
      ctx,
      async (u) => void ctx.reply(t(u.lang).chooseLang, { reply_markup: langKeyboard() }),
    ),
  );

  bot.command("cancel", (ctx) =>
    withUser(ctx, async (u) => {
      ctx.session = { step: "idle" };
      await ctx.reply(t(u.lang).canceled);
    }),
  );

  bot.command("buy", (ctx) => withUser(ctx, (u) => showPacks(ctx, u.lang)));

  bot.callbackQuery(/^lang:(uz|ru)$/, async (ctx) => {
    const lang = ctx.match[1] as Lang;
    await upsertUser(ctx.from.id, lang, ctx.from.username);
    await setLang(ctx.from.id, lang);
    await ctx.answerCallbackQuery();
    await ctx.reply(t(lang).askPhoto);
  });

  bot.callbackQuery(/^pack:(p1|p5|p20)$/, (ctx) =>
    withUser(ctx, async (u) => {
      const code = ctx.match[1]!;
      if (!isPackCode(code)) return;
      await ctx.answerCallbackQuery();
      await showCheckout(ctx, code, u.lang);
    }),
  );

  bot.callbackQuery(/^stars:(p1|p5|p20)$/, (ctx) =>
    withUser(ctx, async (u) => {
      const code = ctx.match[1]!;
      if (!isPackCode(code)) return;
      await ctx.answerCallbackQuery();
      await sendStarsInvoice(ctx, code, u.lang);
    }),
  );

  bot.on("pre_checkout_query", (ctx) => ctx.answerPreCheckoutQuery(true).then(() => undefined));

  bot.on("message:successful_payment", (ctx) =>
    withUser(ctx, async (u) => {
      const payment = ctx.message.successful_payment;
      const orderId = orderIdFromPayload(payment.invoice_payload);
      if (!orderId) return;
      const pack = Object.values(PACKS).find((p) => p.stars === payment.total_amount);
      const credits = pack?.credits ?? 1;
      const balance = await creditStarsPayment(
        ctx.from.id,
        orderId,
        credits,
        payment.telegram_payment_charge_id,
      );
      await ctx.reply(t(u.lang).paid(credits, balance));
    }),
  );

  bot.on("message:photo", (ctx) =>
    withUser(ctx, async (u) => {
      const photo = ctx.message.photo.at(-1)!;
      ctx.session = { step: "title", fileId: photo.file_id, runId: crypto.randomUUID() };
      await ctx.reply(t(u.lang).askTitle, { reply_markup: skipKeyboard(u.lang) });
    }),
  );

  bot.on("message:text", (ctx) =>
    withUser(ctx, async (u) => {
      const d = t(u.lang);
      const text = ctx.message.text.trim();
      const skipped = text === d.skip;

      switch (ctx.session.step) {
        case "title":
          ctx.session.title = skipped ? "" : text;
          ctx.session.step = "price";
          await ctx.reply(d.askPrice, { reply_markup: skipKeyboard(u.lang) });
          return;

        case "price": {
          if (skipped) {
            ctx.session.priceUzs = null;
          } else {
            const price = parsePrice(text);
            if (price === null) {
              await ctx.reply(d.priceHint, { reply_markup: skipKeyboard(u.lang) });
              return;
            }
            ctx.session.priceUzs = price;
          }
          ctx.session.step = "bullets";
          await ctx.reply(d.askBullets, { reply_markup: skipKeyboard(u.lang) });
          return;
        }

        case "bullets":
          ctx.session.bullets = skipped ? [] : splitBullets(text);
          await generate(ctx, u.lang);
          return;

        case "working":
          return;

        default:
          await ctx.reply(d.askPhoto);
      }
    }),
  );

  return bot;
}

type BriefUser = { lang: Lang; credits: number; free_card_used: boolean };

async function withUser(ctx: Ctx, fn: (user: BriefUser) => Promise<void>): Promise<void> {
  const tgId = ctx.from?.id;
  if (!tgId) return;
  const user =
    (await getUser(tgId)) ??
    (await upsertUser(tgId, langFromTelegram(ctx.from?.language_code), ctx.from?.username));
  try {
    await fn(user);
  } catch (err) {
    console.error("handler failed", err);
    await ctx.reply(t(user.lang).genericError).catch(() => {});
  }
}

function langKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("O'zbekcha", "lang:uz").text("Русский", "lang:ru");
}

function skipKeyboard(lang: Lang) {
  return {
    keyboard: [[{ text: t(lang).skip }]],
    resize_keyboard: true,
    one_time_keyboard: true,
  };
}

async function showPacks(ctx: Ctx, lang: Lang): Promise<void> {
  const d = t(lang);
  const kb = new InlineKeyboard();
  for (const pack of Object.values(PACKS)) {
    kb.text(d.packLabel(pack.credits, pack.amountUzs), `pack:${pack.code}`).row();
  }
  await ctx.reply(d.buyTitle, { reply_markup: kb });
}

async function showCheckout(ctx: Ctx, code: PackCode, lang: Lang): Promise<void> {
  const d = t(lang);
  const pack = PACKS[code];
  const kb = new InlineKeyboard();

  if (config.click.enabled) {
    const order = await createOrder({
      tgId: ctx.from!.id,
      pack: code,
      credits: pack.credits,
      amountUzs: pack.amountUzs,
      provider: "click",
    });
    const me = await ctx.api.getMe();
    kb.url(d.payClick, paymentLink(order.id, pack.amountUzs, me.username)).row();
  }
  kb.text(d.payStars(pack.stars), `stars:${code}`);

  await ctx.reply(d.payPrompt(pack.amountUzs), { reply_markup: kb });
}

export function parsePrice(text: string): number | null {
  const digits = text.replace(/[\s .,']/g, "");
  if (!/^\d{3,12}$/.test(digits)) return null;
  return Number(digits);
}

export function splitBullets(text: string): string[] {
  return text
    .split("\n")
    .map((s) => s.replace(/^[-•*\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, 3);
}

async function generate(ctx: Ctx, lang: Lang): Promise<void> {
  const d = t(lang);
  const tgId = ctx.from!.id;
  const fileId = ctx.session.fileId;
  const runId = ctx.session.runId ?? crypto.randomUUID();

  if (!fileId) {
    ctx.session = { step: "idle" };
    await ctx.reply(d.askPhoto);
    return;
  }

  // Paid balance wins over the free sample, so buying never downgrades a
  // seller from four cards to one.
  const user = await getUser(tgId);
  const hasCredit = (user?.credits ?? 0) >= 1;
  const free = hasCredit ? false : await claimFreeCard(tgId);
  let charged = false;

  if (!free) {
    if (!hasCredit) {
      ctx.session = { step: "idle" };
      await showPacks(ctx, lang);
      await ctx.reply(d.noCredits);
      return;
    }
    await applyLedger(tgId, -1, "pack", runId);
    charged = true;
  }

  const brief: ProductBrief = {
    title: ctx.session.title ?? "",
    priceUzs: ctx.session.priceUzs ?? null,
    bullets: ctx.session.bullets ?? [],
    lang,
  };
  const cards: CardType[] = free ? ["main"] : CARD_ORDER;

  ctx.session.step = "working";
  const status = await ctx.reply(d.queued, { reply_markup: { remove_keyboard: true } });

  try {
    const photo = await downloadTelegramFile(ctx, fileId);
    const pack = await runPack(provider, {
      tgId,
      photo,
      brief,
      free,
      cards,
      onProgress: (done, total) => {
        if (done >= total) return;
        void ctx.api
          .editMessageText(status.chat.id, status.message_id, d.progress(done, total))
          .catch(() => {});
      },
    });

    const ok = pack.results.filter((r): r is Extract<CardResult, { ok: true }> => r.ok);

    if (ok.length === 0) {
      if (charged) await applyLedger(tgId, 1, "refund", runId);
      await ctx.reply(d.packFailed);
      return;
    }

    await deliver(ctx, lang, ok);

    if (ok.length < pack.results.length && charged) {
      await applyLedger(tgId, 1, "refund", runId);
    }

    const balance = (await getUser(tgId))?.credits ?? 0;
    if (free) {
      await ctx.reply(`${d.freeSample}\n\n${d.moderationNote}`);
    } else if (ok.length < pack.results.length) {
      await ctx.reply(d.packPartial(ok.length, pack.results.length, balance));
    } else {
      await ctx.reply(`${d.packReady(balance)}\n\n${d.moderationNote}`);
    }
  } catch (err) {
    console.error("generation failed", err);
    if (charged) await applyLedger(tgId, 1, "refund", runId);
    await ctx.reply(d.packFailed);
  } finally {
    ctx.session = { step: "idle" };
  }
}

/**
 * Previews go as photos so the seller can judge them on a phone; the same
 * files also go as documents, because Telegram recompresses photos and a
 * marketplace wants the untouched 1200x1600 JPEG.
 */
async function deliver(
  ctx: Ctx,
  lang: Lang,
  cards: Extract<CardResult, { ok: true }>[],
): Promise<void> {
  const d = t(lang);

  if (cards.length === 1) {
    const only = cards[0]!;
    await ctx.replyWithPhoto(new InputFile(only.image), {
      caption: d.cardCaption(d.cardName[only.card]),
    });
  } else {
    await ctx.replyWithMediaGroup(
      cards.map((r) =>
        InputMediaBuilder.photo(new InputFile(r.image), {
          caption: d.cardCaption(d.cardName[r.card]),
        }),
      ),
    );
  }

  for (const r of cards) {
    await ctx.replyWithDocument(new InputFile(r.image, `${r.card}-1200x1600.jpg`));
  }
}

async function downloadTelegramFile(ctx: Ctx, fileId: string): Promise<Buffer> {
  const file = await ctx.api.getFile(fileId);
  if (!file.file_path) throw new Error("Telegram returned no file path");
  const res = await fetch(
    `https://api.telegram.org/file/bot${config.botToken}/${file.file_path}`,
  );
  if (!res.ok) throw new Error(`Telegram file download failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}
