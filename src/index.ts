import { config } from "./config.js";
import { createBot } from "./bot/index.js";
import { createHttpServer } from "./http.js";
import { ensureBucket } from "./storage.js";

const bot = createBot();
const server = createHttpServer(bot);

await ensureBucket();

server.listen(config.port, () => {
  console.log(`http listening on :${config.port}`);
});

await bot.api.setMyCommands([
  { command: "start", description: "Start / Boshlash" },
  { command: "buy", description: "Buy cards / Kartochka sotib olish" },
  { command: "balance", description: "Balance / Balans" },
  { command: "lang", description: "Language / Til" },
  { command: "cancel", description: "Cancel / Bekor qilish" },
]);

const me = await bot.api.getMe();
console.log(`bot @${me.username} starting`);

const stop = async () => {
  console.log("shutting down");
  await bot.stop();
  server.close();
  process.exit(0);
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);

await bot.start({ onStart: () => console.log("polling") });
