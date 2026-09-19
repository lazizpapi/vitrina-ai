# Vitrina AI

A Telegram bot that turns one product photo into a full marketplace card set for
Uzum, Wildberries and Ozon.

The seller sends a photo, a title, a price and three selling points in Uzbek or
Russian. They get back four images at 1200×1600, 3:4, sRGB JPEG, ready to upload:

| Card | What it is |
|------|------------|
| Main | Their own product on a clean studio backdrop. Shape, colour and labels untouched. |
| Lifestyle | The product in a real scene that suits its category. |
| With model | A person holding or using the product. |
| Infographic | The product with the price and three selling points drawn on top. |

Generation runs on the [Higgsfield API](https://docs.higgsfield.ai/docs). Payment
runs in Uzbek soʻm through Click, or in Telegram Stars.

## Why it exists

Higgsfield opened a pay-per-use API in September 2026 and one of their team
offered $50k to anyone who builds a competitor on it. A general-purpose studio is
already a crowded field. A seller in Tashkent, though, cannot pay a US API with a
local card, does not read English prompt syntax, and does not know that a
marketplace main photo has to keep the real product intact. That gap is the
product.

## Design notes

**The card catalog is the contract.** `src/generation/cards.ts` holds every card
type with its endpoint, aspect ratio, resolution and prompt guidance. Adding a
card type or changing a model is a data change, not a code change.

**Text is never drawn by the image model.** Diffusion models mangle Cyrillic and
Uzbek Latin. The infographic gets a clean backdrop from the model, and
`src/render/infographic.ts` composites the price badge and bullets with sharp,
using a bundled Noto Sans face so the container's font set does not matter.

**The main card is an edit, not a generation.** Uzum and Wildberries moderators
require the main photo to show the real product with its shape, colour and
configuration unchanged. Every prompt carries that constraint, and the seller's
photo always goes along as a reference image.

**One provider, one seam.** `src/generation/provider.ts` is a four-line interface.
`HiggsfieldProvider` is the only implementation today; a second one is a new file,
not a refactor.

**The ledger is idempotent.** Credits move through a Postgres function keyed on
`(reason, ref_id)`. Telegram redelivering a payment, or Click repeating its
Complete callback, cannot double-credit an account.

**Partial packs are free.** If two of four cards fail, the seller keeps the two
that worked and the credit goes back.

## Stack

TypeScript on Node 22+, [grammY](https://grammy.dev) for Telegram, Supabase for
Postgres and object storage, [sharp](https://sharp.pixelplumbing.com) for
compositing, OpenAI for turning a Uzbek or Russian brief into English scene
prompts, and the official Higgsfield SDK.

## Setup

```bash
npm install
npm run fonts
cp .env.example .env
```

1. **Higgsfield.** Create a key at [open.higgsfield.ai](https://open.higgsfield.ai),
   top up a balance, and put `keyId:keySecret` in `HF_API_KEY`.
2. **Supabase.** Create a project, run `db/migrations/001_init.sql` in the SQL
   editor, then copy the project URL and the service-role key into `.env`. The
   storage bucket is created on first boot.
3. **Telegram.** Create a bot with [@BotFather](https://t.me/BotFather) and put the
   token in `BOT_TOKEN`.
4. **OpenAI.** Any key works; the default model is set by `OPENAI_MODEL`.
5. **Click (optional).** Sign a merchant contract, then set the four `CLICK_*`
   values, point the Shop API Prepare and Complete URLs at
   `$PUBLIC_URL/click/prepare` and `$PUBLIC_URL/click/complete`, and set
   `CLICK_ENABLED=true`. Until then the bot sells in Telegram Stars only.

```bash
npm run dev
```

## Payments

Telegram requires digital goods sold inside a bot to be paid in Stars, so Stars is
always offered. Click appears as an external checkout link, which the rule allows,
and credits land through the Shop API callbacks. Both paths write through the same
idempotent ledger.

Packs: 25 000 soʻm for one product, 100 000 for five, 350 000 for twenty. One
credit is one product, which is four images. Every new user gets one free main
card.

## Tests

```bash
npm test
```

Covers the Click signature and callback state machine, price and bullet parsing,
the prompt builder including its offline fallback, and the infographic renderer.
Nothing in the suite touches the network.

## Deploying

Runs as one long-lived Node process. On Railway, set the environment variables
above, expose the port, and point Click's callbacks at the public domain.
`GET /health` is the health check.

## Licence

MIT. See [LICENSE](LICENSE).
