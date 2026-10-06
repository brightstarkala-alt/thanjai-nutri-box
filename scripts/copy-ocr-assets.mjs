// Copies the in-browser OCR engine (tesseract.js worker + WASM core) and
// the English language data from node_modules into public/ocr, so payment
// screenshots are read entirely in the customer's browser with assets
// served from our own origin — no CDN, and the screenshot never leaves the
// device. Runs on postinstall and before build; public/ocr is gitignored.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public", "ocr");

const files = [
  ["node_modules/tesseract.js/dist/worker.min.js", "worker.min.js"],
  // LSTM-only cores; the worker picks one by the browser's SIMD support.
  ["node_modules/tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js", "tesseract-core-relaxedsimd-lstm.wasm.js"],
  ["node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js", "tesseract-core-simd-lstm.wasm.js"],
  ["node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js", "tesseract-core-lstm.wasm.js"],
  // Compact (best_int) English model.
  ["node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz", "lang/eng.traineddata.gz"],
];

for (const [from, to] of files) {
  const src = join(root, from);
  if (!existsSync(src)) {
    console.warn(`[copy-ocr-assets] missing ${from} — payment screenshot reading will be unavailable`);
    continue;
  }
  const dest = join(out, to);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
}
