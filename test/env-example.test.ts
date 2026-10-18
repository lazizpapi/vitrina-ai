import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// .env.example is committed to a public repository, so a real value typed into
// it by mistake is published on the next push. Secrets belong in .env only.
const SECRETS = [
  "BOT_TOKEN",
  "WEBHOOK_SECRET",
  "HF_API_KEY",
  "ANTHROPIC_API_KEY",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "CLICK_MERCHANT_ID",
  "CLICK_SERVICE_ID",
  "CLICK_MERCHANT_USER_ID",
  "CLICK_SECRET_KEY",
  "ADMIN_TG_ID",
];

describe(".env.example", () => {
  const lines = readFileSync(new URL("../.env.example", import.meta.url), "utf8").split(/\r?\n/);

  it.each(SECRETS)("leaves %s blank", (key) => {
    const line = lines.find((l) => l.startsWith(`${key}=`));
    expect(line, `${key} is missing from .env.example`).toBeDefined();
    expect(line).toBe(`${key}=`);
  });
});
