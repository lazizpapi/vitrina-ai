# Launch checklist

Everything the code cannot do for itself, in the order it blocks on.

## Blocking, do first

**Supabase project.** The account is at its free-project limit of two. Either free
a slot by pausing or deleting an unused project, or point `.env` at an existing
one. Then run `db/migrations/001_init.sql` in the SQL editor and copy the project
URL and service-role key into `.env`. The storage bucket creates itself on boot.

**Higgsfield key and balance.** Sign up at open.higgsfield.ai, create an API key,
top up. If an Uzbek card is refused, use a USD card or Payoneer. The launch offer
gives up to 50% off three chosen models and has to be locked within seven days of
signup, so pick Marketing Studio Image first.

**Check the real per-image price** in the console and update `ESTIMATED_COST_USD`
in `src/generation/cards.ts`. The API does not return a price with a result, so
that constant is what `jobs.cost_usd` records. At 0.02 USD a pack of four costs
about 0.08, against a 25 000 soʻm single pack.

**Bot token** from @BotFather. Check the handle `@vitrina_ai_bot` is free;
fallbacks are Lavha and Kartello.

## Click merchant, in parallel

The contract needs the YaTT documents and takes days, so start it on day one. Once
approved, set the four `CLICK_*` values, register the Shop API callbacks as
`$PUBLIC_URL/click/prepare` and `$PUBLIC_URL/click/complete`, and flip
`CLICK_ENABLED=true`. Test against the Click test terminal before going live:
a payment must hit Prepare then Complete, credit exactly once, and a bad signature
must come back as `-1`.

Until Click is live the bot sells in Telegram Stars, which needs no paperwork.
Stars payouts go through Fragment and carry the platform cut, so treat them as the
fallback rather than the plan.

## Verify before announcing

- A photo in, four cards out, under ninety seconds.
- Infographic text correct in both Uzbek Latin and Cyrillic.
- A real seller uploads the main card to Uzum and it passes moderation. This is
  the one check that cannot be faked, because it decides whether the product is
  legal on the platform at all.
- Kill the Higgsfield key mid-run: the credit must come back and the seller must
  be told.
- Buy a pack twice with the same Telegram payment update: the balance moves once.

## Open risks

**Uzum's written policy on AI imagery** is not published in full. The main card is
built as an edit of the seller's own photo for exactly this reason, but the
secondary cards are synthetic scenes and a moderator may treat them differently.
Confirm with a live upload before selling volume.

**The $50k has no published criteria**, no judging panel and no submission form.
Treat the public post as marketing that might pay, not as a deliverable.

**Higgsfield keeps output files about seven days.** Everything is copied to
Supabase Storage on the way through, so the seller can be given a re-download
later. That copy is the only durable one.
