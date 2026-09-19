// Downloads the two Noto Sans faces the infographic renderer uses.
// Noto Sans is licensed under the SIL Open Font License 1.1.
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const DIR = path.resolve(import.meta.dirname, "../assets/fonts");
const BASE =
  "https://raw.githubusercontent.com/googlefonts/noto-fonts/main/hinted/ttf/NotoSans";

const FILES = ["NotoSans-Bold.ttf", "NotoSans-Regular.ttf"];

await mkdir(DIR, { recursive: true });

for (const name of FILES) {
  const target = path.join(DIR, name);
  if (existsSync(target)) {
    console.log(`have ${name}`);
    continue;
  }
  const url = `${BASE}/${name}`;
  const res = await fetch(url);
  if (!res.ok) {
    // The renderer falls back to a system font, so a missing face must not
    // stop the service from booting.
    console.error(`failed ${name}: ${res.status} ${res.statusText}`);
    continue;
  }
  await writeFile(target, Buffer.from(await res.arrayBuffer()));
  console.log(`saved ${name}`);
}
