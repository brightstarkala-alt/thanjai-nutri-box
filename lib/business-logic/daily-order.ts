import type { AddOn, AddOnQuantities, BoxDisplay, BoxId, DateBoxQuantities } from "@/lib/types";
import { calculateOrderTotal } from "@/lib/business-logic/pricing";

/**
 * Everything ordered for ONE delivery date in the Daily plan. Each date
 * keeps its own Box 1 / Box 2 / add-on quantities, fully independent of
 * every other date.
 */
export type DateSelection = {
  boxes: DateBoxQuantities;
  addOns: AddOnQuantities;
};

/** delivery date (YYYY-MM-DD) -> that date's selection */
export type DateSelections = Record<string, DateSelection>;

export const EMPTY_DATE_SELECTION: DateSelection = {
  boxes: { "box-1": 0, "box-2": 0 },
  addOns: {},
};

export function getDateSelection(selections: DateSelections, date: string): DateSelection {
  return selections[date] ?? EMPTY_DATE_SELECTION;
}

export function withBoxQuantity(
  selections: DateSelections,
  date: string,
  boxId: BoxId,
  quantity: number
): DateSelections {
  const current = getDateSelection(selections, date);
  return {
    ...selections,
    [date]: { ...current, boxes: { ...current.boxes, [boxId]: Math.max(0, quantity) } },
  };
}

/**
 * Weekly/Monthly Customize: like withBoxQuantity, but when the date ends up
 * with no boxes its extras are cleared too, so it becomes a clean skip
 * instead of an "extras without a box" date.
 */
export function withBoxQuantityAutoSkip(
  selections: DateSelections,
  date: string,
  boxId: BoxId,
  quantity: number
): DateSelections {
  const next = withBoxQuantity(selections, date, boxId, quantity);
  const updated = next[date];
  const hasBox = Object.values(updated.boxes).some((q) => q > 0);
  return hasBox ? next : { ...next, [date]: { ...updated, addOns: {} } };
}

export function withAddOnQuantity(
  selections: DateSelections,
  date: string,
  addOnId: string,
  quantity: number
): DateSelections {
  const current = getDateSelection(selections, date);
  return {
    ...selections,
    [date]: { ...current, addOns: { ...current.addOns, [addOnId]: Math.max(0, quantity) } },
  };
}

/**
 * Standard Weekly/Monthly: one "every day" selection (independent Box 1 /
 * Box 2 / add-on quantities) copied onto each eligible date where at least
 * one of its boxes is orderable. Produces the same per-date model as Daily,
 * so pricing goes through calculateDateSubtotal too.
 */
export function buildUniformSelections(
  dates: string[],
  everyDay: DateSelection,
  getBoxes: (date: string) => BoxDisplay[]
): DateSelections {
  const selections: DateSelections = {};
  for (const date of dates) {
    const hasOrderableBox = getBoxes(date).some(
      (b) => b.available && b.price != null && (everyDay.boxes[b.id] ?? 0) > 0
    );
    if (!hasOrderableBox) continue;
    selections[date] = { boxes: { ...everyDay.boxes }, addOns: { ...everyDay.addOns } };
  }
  return selections;
}

export type DateSubtotal = {
  date: string;
  /** Orderable boxes with quantity > 0, e.g. [{ name: "Box 1", quantity: 2, ... }] */
  boxLines: { boxId: BoxId; name: string; unitPrice: number; quantity: number }[];
  addOnLines: { addOnId: string; name: string; unitPrice: number; quantity: number }[];
  boxCount: number;
  boxTotal: number;
  addOnTotal: number;
  total: number;
};

/**
 * Prices one date's selection against that date's resolved menu. Items
 * that aren't orderable on the date (unavailable / unpriced) contribute
 * nothing, even if a quantity is stored for them.
 */
export function calculateDateSubtotal(
  date: string,
  selection: DateSelection,
  boxes: BoxDisplay[],
  addOns: AddOn[]
): DateSubtotal {
  const boxLines = boxes
    .filter((b) => b.available && b.price != null && (selection.boxes[b.id] ?? 0) > 0)
    .map((b) => ({ boxId: b.id, name: b.name, unitPrice: b.price as number, quantity: selection.boxes[b.id] }));
  const addOnLines = addOns
    .filter((a) => a.available && (selection.addOns[a.id] ?? 0) > 0)
    .map((a) => ({ addOnId: a.id, name: a.name, unitPrice: a.price, quantity: selection.addOns[a.id] }));

  const boxTotal = calculateOrderTotal(boxLines);
  const addOnTotal = calculateOrderTotal(addOnLines);
  return {
    date,
    boxLines,
    addOnLines,
    boxCount: boxLines.reduce((sum, l) => sum + l.quantity, 0),
    boxTotal,
    addOnTotal,
    total: boxTotal + addOnTotal,
  };
}

export type PlanTotals = {
  /** Every date in the plan, priced (including skipped ones). */
  days: DateSubtotal[];
  /** Dates with at least one box — the actual deliveries. */
  deliveries: DateSubtotal[];
  boxTotal: number;
  addOnTotal: number;
  total: number;
  /** First date that has extras but no box (not a valid delivery). */
  extrasOnly?: DateSubtotal;
};

/**
 * Prices every date of a Weekly/Monthly plan with calculateDateSubtotal and
 * sums the deliveries. A skipped date (no box) contributes nothing, even if
 * extras are still set on it — those are flagged via `extrasOnly` instead.
 */
export function summarizePlan(
  dates: string[],
  selections: DateSelections,
  getBoxes: (date: string) => BoxDisplay[],
  getAddOns: (date: string) => AddOn[]
): PlanTotals {
  const days = dates.map((date) =>
    calculateDateSubtotal(date, getDateSelection(selections, date), getBoxes(date), getAddOns(date))
  );
  const deliveries = days.filter((d) => d.boxCount > 0);
  const boxTotal = deliveries.reduce((sum, d) => sum + d.boxTotal, 0);
  const addOnTotal = deliveries.reduce((sum, d) => sum + d.addOnTotal, 0);
  return {
    days,
    deliveries,
    boxTotal,
    addOnTotal,
    total: boxTotal + addOnTotal,
    extrasOnly: days.find((d) => d.boxCount === 0 && d.addOnLines.length > 0),
  };
}
