import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const FONT_DIR = path.resolve(here, "../../assets/fonts");

export type Weight = "Bold" | "Regular";

/**
 * A bundled font face, when one is present. Passing the file to sharp removes
 * any dependency on fonts installed in the container, which is what keeps
 * Cyrillic and Uzbek Latin from rendering as boxes on a slim Linux image.
 */
export function bundledFont(weight: Weight = "Bold"): { file: string; family: string } | null {
  if (!existsSync(FONT_DIR)) return null;
  const files = readdirSync(FONT_DIR).filter((f) => /\.(ttf|otf)$/i.test(f));
  if (!files.length) return null;

  const wanted = weight === "Bold" ? /bold/i : /regular|book/i;
  const pick = files.find((f) => wanted.test(f)) ?? files[0]!;
  return { file: path.join(FONT_DIR, pick), family: familyFromFilename(pick) };
}

function familyFromFilename(file: string): string {
  // "NotoSans-Bold.ttf" -> "Noto Sans"
  return file
    .replace(/\.(ttf|otf)$/i, "")
    .split("-")[0]!
    .replace(/([a-z])([A-Z])/g, "$1 $2");
}

/** Pango font description, e.g. "Noto Sans Bold 48". */
export function pangoFont(weight: Weight, size: number): string {
  const family = bundledFont(weight)?.family ?? "DejaVu Sans";
  return `${family} ${weight} ${size}`;
}
