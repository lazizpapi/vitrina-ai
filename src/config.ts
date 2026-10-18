import "dotenv/config";

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}

function opt(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export const config = {
  botToken: req("BOT_TOKEN"),
  publicUrl: opt("PUBLIC_URL").replace(/\/+$/, ""),
  useWebhook: opt("USE_WEBHOOK", "false") === "true",
  webhookSecret: opt("WEBHOOK_SECRET"),
  port: Number(opt("PORT", "3000")),
  adminTgId: opt("ADMIN_TG_ID") ? Number(opt("ADMIN_TG_ID")) : null,

  higgsfield: {
    apiKey: req("HF_API_KEY"),
    baseUrl: opt("HF_API_BASE_URL", "https://api.higgsfield.ai").replace(/\/+$/, ""),
    // Generations the account may run at once. Higgsfield ties this to funds
    // added in the last 28 days: 2 under $25, 10 from $25, 20 from $100.
    concurrency: Number(opt("HF_CONCURRENCY", "2")),
  },

  // The SDK reads ANTHROPIC_API_KEY itself, or an `ant auth login` profile,
  // so the key is not demanded here. A missing key shows up as a logged
  // fallback to template prompts rather than a crash.
  anthropic: {
    model: opt("ANTHROPIC_MODEL", "claude-sonnet-5-5"),
  },

  supabase: {
    url: req("SUPABASE_URL"),
    serviceKey: req("SUPABASE_SERVICE_ROLE_KEY"),
    bucket: opt("SUPABASE_BUCKET", "vitrina"),
  },

  click: {
    enabled: opt("CLICK_ENABLED", "false") === "true",
    merchantId: opt("CLICK_MERCHANT_ID"),
    serviceId: opt("CLICK_SERVICE_ID"),
    merchantUserId: opt("CLICK_MERCHANT_USER_ID"),
    secretKey: opt("CLICK_SECRET_KEY"),
  },
} as const;

export type Config = typeof config;
