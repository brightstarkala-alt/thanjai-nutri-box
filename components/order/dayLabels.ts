import type { CalendarDay } from "@/lib/types";

export const REASON_LABEL: Record<NonNullable<CalendarDay["reason"]>, string> = {
  past: "Past",
  holiday: "Holiday",
  unavailable: "Closed",
};

export function monthShortOf(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", { month: "short" });
}

/** e.g. "Tuesday, 6 Oct" — for order review cards. */
export function formatReviewDate(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  const weekday = d.toLocaleDateString("en-IN", { weekday: "long" });
  return `${weekday}, ${d.getDate()} ${monthShortOf(date)}`;
}

export function dayShortOf(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short" });
}
