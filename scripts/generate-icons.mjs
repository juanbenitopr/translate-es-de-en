import { createCanvas, loadImage } from "@napi-rs/canvas";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const sourceIconPath = path.join(rootDir, "icons", "translator-mark.svg");
const outputDir = path.join(rootDir, "icons");
const sizes = [32, 48, 64, 96, 128];

const image = await loadImage(sourceIconPath);
mkdirSync(outputDir, { recursive: true });

for (const size of sizes) {
  const canvas = createCanvas(size, size);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0, size, size);

  const outputPath = path.join(outputDir, `translator-mark-${size}.png`);
  writeFileSync(outputPath, canvas.toBuffer("image/png"));
  console.log(`Icono generado: icons/translator-mark-${size}.png`);
}
