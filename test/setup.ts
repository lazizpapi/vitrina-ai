// Fills the env the config module demands, so pure logic can be tested
// without a Supabase project, a bot token or an API key.
process.env.BOT_TOKEN ||= "0:test";
process.env.HF_API_KEY ||= "id:secret";
process.env.OPENAI_API_KEY ||= "sk-test";
process.env.SUPABASE_URL ||= "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "service-key";
process.env.CLICK_ENABLED ||= "true";
process.env.CLICK_MERCHANT_ID ||= "12345";
process.env.CLICK_SERVICE_ID ||= "54321";
process.env.CLICK_MERCHANT_USER_ID ||= "999";
process.env.CLICK_SECRET_KEY ||= "top-secret";
