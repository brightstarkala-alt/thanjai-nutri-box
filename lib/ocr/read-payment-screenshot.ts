"use client";

// Reads a payment screenshot entirely in the customer's browser using
// tesseract.js (WebAssembly). The engine and English model are served from
// our own origin (/ocr, copied by scripts/copy-ocr-assets.mjs) — the
// screenshot is never uploaded anywhere and nothing is logged.

import { parsePaymentText, type ParsedPayment } from "@/lib/business-logic/payment-ocr";

/**
 * Draws the image onto a canvas sized for OCR, converts to grayscale and
 * inverts dark-mode screenshots so text is dark on light — Tesseract reads
 * that best. Only small screenshots are enlarged: enlarging a normal phone
 * screenshot makes the big headline amount too large for Tesseract to
 * recognise as text.
 */
async function prepareImage(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file);
  const scale = bitmap.width < 700 ? 1000 / bitmap.width : Math.min(1, 1600 / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas is not available");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = image.data;
  let sum = 0;
  for (let i = 0; i < px.length; i += 4) {
    const gray = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    px[i] = px[i + 1] = px[i + 2] = gray;
    sum += gray;
  }
  if (sum / (px.length / 4) < 110) {
    for (let i = 0; i < px.length; i += 4) px[i] = px[i + 1] = px[i + 2] = 255 - px[i];
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/** `orderTotal` only helps choose between OCR readings of the amount (see parsePaymentText). */
function halfSize(source: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(source.width / 2);
  canvas.height = Math.round(source.height / 2);
  canvas.getContext("2d")?.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export async function readPaymentScreenshot(file: File, orderTotal: number): Promise<ParsedPayment> {
  const canvas = await prepareImage(file);
  const { createWorker, OEM, PSM } = await import("tesseract.js");
  const origin = window.location.origin;
  const worker = await createWorker("eng", OEM.LSTM_ONLY, {
    workerPath: `${origin}/ocr/worker.min.js`,
    corePath: `${origin}/ocr/`,
    langPath: `${origin}/ocr/lang`,
    gzip: true,
    workerBlobURL: false,
  });
  try {
    const first = parsePaymentText((await worker.recognize(canvas)).data.text, orderTotal);
    if (first.amount != null && (first.utr != null || first.transactionId != null)) return first;
    // Second look for anything still missing: half size, "sparse text" mode
    // (finds isolated lines like a big amount). Only fills gaps — it never
    // replaces a value the first pass found.
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
    const second = parsePaymentText((await worker.recognize(halfSize(canvas))).data.text, orderTotal);
    return {
      amount: first.amount ?? second.amount,
      transactionId: first.transactionId ?? second.transactionId,
      utr: first.utr ?? second.utr,
      paidAt: first.paidAt ?? second.paidAt,
    };
  } finally {
    await worker.terminate();
  }
}
