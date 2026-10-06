/**
 * Extracts UPI payment details from the OCR text of a payment screenshot.
 *
 * Pure and deterministic — no I/O, no logging (screenshot text is
 * sensitive). Only values that match a recognisable label/shape are
 * returned; anything not found is null, never guessed.
 *
 * Rules:
 * - UTR / RRN: NPCI references are exactly 12 digits. A 12-digit value
 *   next to a reference-style label (UTR, RRN, UPI Ref No, Reference No,
 *   "UPI transaction ID" as Google Pay labels it, …) is the UTR/RRN.
 * - Transaction ID: an app's own alphanumeric ID (e.g. PhonePe "T2410…",
 *   Google Pay "CICAgK…") next to a transaction-ID-style label. It is kept
 *   separate from the UTR — they are often different values.
 * - Amount: a value after ₹ / Rs / INR, on/after an Amount / Paid line, a
 *   big standalone amount line, or a formatted amount ending a line.
 *   Tesseract's English model has no "₹" glyph: it drops it ("1,482") or
 *   misreads it as a leading 3/2/% ("31,200" for ₹1,200), so both readings
 *   are considered. The order total (if given) only breaks ties between
 *   those readings and discards implausible ones — it never creates a
 *   value that isn't on the screenshot.
 * - Date/time: the first recognisable date (with time, if present).
 */

export type ParsedPayment = {
  amount: number | null;
  transactionId: string | null;
  utr: string | null;
  paidAt: string | null;
};

const REFERENCE_LABEL =
  /\b((?:utr|rrn)(?:\s*(?:no|number))?|upi\s*ref(?:erence)?(?:\s*(?:no|number|id))?|ref(?:erence)?\s*(?:no|number|id)|bank\s*ref(?:erence)?(?:\s*(?:no|number))?|upi\s*transaction\s*id|transaction\s*ref(?:erence)?(?:\s*(?:no|number))?)\b\.?/i;
const TRANSACTION_LABEL =
  /\b((?:google\s*|phonepe\s*|paytm\s*|upi\s*)?(?:transaction|txn)\s*(?:id|no|number)|order\s*id)\b\.?/i;
const AMOUNT_LABEL = /\b(amount|paid|debited|total|payment\s*of|sent)\b/i;
const CURRENCY_AMOUNT = /(?:₹|\brs\.?|\binr)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/gi;
const PLAIN_AMOUNT = /(?:^|\s)([0-9]{1,3}(?:,[0-9]{2,3})+(?:\.[0-9]{1,2})?|[0-9]{1,6}(?:\.[0-9]{1,2})?)(?=\s|$)/g;

const MONTHS = "jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec";
const TIME = String.raw`\d{1,2}[:.]\d{2}(?:[:.]\d{2})?\s*(?:am|pm|AM|PM)?`;
const DATE_PATTERNS = [
  // 07:45 pm on 12 Oct 2026 (time first)
  new RegExp(String.raw`${TIME}\s*(?:on|,)?\s*\d{1,2}\s*(?:${MONTHS})[a-z]*,?\s*\d{2,4}`, "i"),
  // 12 Oct 2026, 7:45 pm   |  12 October 2026 at 07:45 PM
  new RegExp(String.raw`\b\d{1,2}\s*(?:${MONTHS})[a-z]*,?\s*\d{2,4}(?:,?\s*(?:at\s*)?${TIME})?`, "i"),
  // Oct 12, 2026, 7:45 pm
  new RegExp(String.raw`\b(?:${MONTHS})[a-z]*\s*\d{1,2},?\s*\d{4}(?:,?\s*(?:at\s*)?${TIME})?`, "i"),
  // 12/10/2026 19:45  |  12-10-2026
  new RegExp(String.raw`\b\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}(?:,?\s*(?:at\s*)?${TIME})?`, "i"),
];

/** OCR often reads 0 as O and 1 as l/I inside long numbers. */
function normaliseDigits(value: string): string {
  return value.replace(/[Oo]/g, "0").replace(/[Il|]/g, "1");
}

/** Value text after a label on the same line, else the next non-empty line. */
function valueAfterLabel(lines: string[], index: number, label: RegExp): string {
  const rest = lines[index].replace(label, "").replace(/^[\s:#.\-–—]+/, "").trim();
  // Only a real value counts (not leftover label text like "No.").
  if (/[A-Za-z0-9]{4,}/.test(rest.replace(/\s/g, ""))) return rest;
  for (let i = index + 1; i < Math.min(lines.length, index + 3); i++) {
    if (lines[i].trim()) return lines[i].trim();
  }
  return "";
}

/** Strict 12-digit UTR/RRN (spaces between digit groups tolerated). */
function asUtr(raw: string): string | null {
  const compact = raw.replace(/[\s\-]/g, "");
  const match = compact.match(/^[0-9OoIl|]{12}(?![0-9])/);
  if (!match) return null;
  const digits = normaliseDigits(match[0]);
  return /^\d{12}$/.test(digits) ? digits : null;
}

/** An app transaction ID: 8–40 letters/digits with at least one digit and one letter. */
function asTransactionId(raw: string): string | null {
  const token = raw.split(/\s+/)[0]?.replace(/[^A-Za-z0-9]/g, "") ?? "";
  if (token.length < 8 || token.length > 40) return null;
  if (!/\d/.test(token) || !/[A-Za-z]/.test(token)) return null;
  return token;
}

function toAmount(raw: string): number | null {
  const value = Number(raw.replace(/,/g, ""));
  return Number.isFinite(value) && value >= 1 && value <= 100000 ? value : null;
}

const GROUPED = /^[0-9]{1,3}(?:,[0-9]{2,3})*(?:\.[0-9]{1,2})?$|^[0-9]{1,6}(?:\.[0-9]{1,2})?$/;

/** The token as read, plus the reading without a leading misread "₹" (3/2/%/F/Z/&). */
function amountReadings(token: string): number[] {
  const out: number[] = [];
  const t = token.replace(/^[%FZ&?€]/, "");
  if (GROUPED.test(t)) {
    const v = toAmount(t);
    if (v != null) out.push(v);
  }
  if (/^[32]/.test(t) && GROUPED.test(t.slice(1))) {
    const v = toAmount(t.slice(1));
    if (v != null && !out.includes(v)) out.push(v);
  }
  return out;
}

const STANDALONE_AMOUNT = /^[%FZ&?€]?[0-9][0-9,]*(?:\.[0-9]{1,2})?$/;
const TRAILING_AMOUNT = /\s([%FZ&?€]?(?:[0-9]{1,3}(?:,[0-9]{2,3})+(?:\.[0-9]{1,2})?|[0-9]+\.[0-9]{2}))$/;

export function parsePaymentText(text: string, expectedAmount?: number): ParsedPayment {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  let utr: string | null = null;
  let transactionId: string | null = null;

  lines.forEach((line, i) => {
    const isReference = REFERENCE_LABEL.test(line);
    const isTransaction = TRANSACTION_LABEL.test(line);
    if (!isReference && !isTransaction) return;
    const value = valueAfterLabel(lines, i, isReference ? REFERENCE_LABEL : TRANSACTION_LABEL);
    // Classify by the value's shape: 12 digits is always the UTR/RRN.
    const asRef = asUtr(value);
    if (asRef) {
      utr ??= asRef;
      return;
    }
    const asTxn = asTransactionId(value);
    if (asTxn) transactionId ??= asTxn;
  });

  // Amount: count each candidate; labelled lines and currency markers win.
  const scores = new Map<number, number>();
  const add = (value: number | null, weight: number) => {
    if (value != null) scores.set(value, (scores.get(value) ?? 0) + weight);
  };
  lines.forEach((line, i) => {
    const isIdLine = REFERENCE_LABEL.test(line) || TRANSACTION_LABEL.test(line);
    const afterIdLabel = i > 0 && (REFERENCE_LABEL.test(lines[i - 1]) || TRANSACTION_LABEL.test(lines[i - 1]));
    const labelled = AMOUNT_LABEL.test(line) && !isIdLine;
    for (const m of line.matchAll(CURRENCY_AMOUNT)) add(toAmount(m[1]), labelled ? 3 : 2);
    if (!isIdLine && !afterIdLabel) {
      // The big amount on its own line (₹ dropped or misread by OCR).
      if (STANDALONE_AMOUNT.test(line)) for (const v of amountReadings(line)) add(v, 2);
      // "Thanjai Healthy Plate ₹1,200" with the ₹ lost.
      const trailing = line.match(TRAILING_AMOUNT);
      if (trailing) for (const v of amountReadings(trailing[1])) add(v, 1);
    }
    if (labelled) {
      // "Paid: 369" may be "Paid: ₹69" with the ₹ misread — consider both.
      const sameLine = [...line.matchAll(PLAIN_AMOUNT)].flatMap((m) => amountReadings(m[1]));
      const next = lines[i + 1] ?? "";
      const nextLine = /^(?:₹|rs\.?|inr)?\s*[0-9][0-9,]*(?:\.[0-9]{1,2})?$/i.test(next)
        ? amountReadings(next.replace(/^(?:₹|rs\.?|inr)\s*/i, ""))
        : [];
      for (const v of [...sameLine, ...nextLine]) add(v, 1);
    }
  });
  let amount: number | null = null;
  if (expectedAmount != null && [...scores.keys()].some((v) => amountsMatch(v, expectedAmount))) {
    // One of the screenshot's own readings is the order total.
    amount = expectedAmount;
  } else {
    // Drop readings far above the order total (a misread ₹ as a leading
    // digit) when a plausible reading exists, then take the best score.
    let candidates = [...scores.entries()];
    if (expectedAmount != null) {
      const plausible = candidates.filter(([v]) => v <= expectedAmount * 5);
      if (plausible.length) candidates = plausible;
    }
    let best = 0;
    for (const [value, score] of candidates) {
      if (score > best) {
        best = score;
        amount = value;
      }
    }
  }

  let paidAt: string | null = null;
  for (const line of lines) {
    for (const pattern of DATE_PATTERNS) {
      const m = line.match(pattern);
      if (m) {
        paidAt = m[0].trim();
        break;
      }
    }
    if (paidAt) break;
  }
  // A time on its own line right after a date-only match.
  if (paidAt && !/\d{1,2}[:.]\d{2}/.test(paidAt)) {
    const idx = lines.findIndex((l) => l.includes(paidAt as string));
    const t = (lines[idx + 1] ?? "").match(new RegExp(`^(?:at\\s*)?(${TIME})$`, "i"));
    if (t) paidAt = `${paidAt}, ${t[1]}`;
  }

  return { amount, transactionId, utr, paidAt };
}

const MONTH_INDEX: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/**
 * Converts a screenshot date/time ("12 Oct 2026, 7:45 pm", "07:45 pm on
 * 12 Oct 2026", "Oct 12, 2026 7:45 PM", "12/10/2026 19:45") to an ISO
 * timestamp in India time (+05:30). Returns null when there's no full date
 * and time — a date alone isn't stored as a payment time.
 */
export function toPaidAtIso(text: string | null): string | null {
  if (!text) return null;
  const s = text.toLowerCase();
  const time = s.match(/(\d{1,2})[:.](\d{2})(?:[:.]\d{2})?\s*(am|pm)?/);
  if (!time) return null;
  let hour = Number(time[1]);
  const minute = Number(time[2]);
  if (time[3] === "pm" && hour < 12) hour += 12;
  if (time[3] === "am" && hour === 12) hour = 0;
  // Date: remove the time first so its digits aren't mistaken for the date.
  const rest = s.replace(time[0], " ");
  let day: number | null = null;
  let month: number | null = null;
  let year: number | null = null;
  const named =
    rest.match(/(\d{1,2})\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*,?\s*(\d{4})/) ??
    rest.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*(\d{1,2}),?\s*(\d{4})/);
  if (named) {
    const dayFirst = /^\d/.test(named[1]);
    day = Number(dayFirst ? named[1] : named[2]);
    month = MONTH_INDEX[dayFirst ? named[2] : named[1]];
    year = Number(named[3]);
  } else {
    // Numeric dates in India are day/month/year.
    const numeric = rest.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
    if (numeric) {
      day = Number(numeric[1]);
      month = Number(numeric[2]) - 1;
      year = Number(numeric[3].length === 2 ? `20${numeric[3]}` : numeric[3]);
    }
  }
  if (day == null || month == null || year == null) return null;
  if (hour > 23 || minute > 59 || month < 0 || month > 11 || day < 1 || day > 31) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  const iso = `${year}-${pad(month + 1)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00+05:30`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

/** Same rupee-and-paise amount (avoids floating-point surprises). */
export function amountsMatch(a: number, b: number): boolean {
  return Math.round(a * 100) === Math.round(b * 100);
}

export function isValidUtr(value: string): boolean {
  return /^\d{12}$/.test(value.trim());
}

export function isValidTransactionId(value: string): boolean {
  return /^[A-Za-z0-9]{8,40}$/.test(value.trim());
}
