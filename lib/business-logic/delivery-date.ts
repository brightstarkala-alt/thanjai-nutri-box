import type { CalendarDay } from "@/lib/types";

// Earliest selectable delivery date: tomorrow, unless today's order cutoff
// (business_settings.default_cutoff_time, e.g. "22:00:00") has passed —
// then the day after. Matches the check in place_customer_order.
export function getMinDeliveryDate(cutoffTime?: string | null): string {
  const now = new Date();
  let daysAhead = 1;
  if (cutoffTime) {
    const [h, m] = cutoffTime.split(":").map(Number);
    if (now.getHours() * 60 + now.getMinutes() >= h * 60 + (m || 0)) daysAhead = 2;
  }
  return toDateInputValue(addDays(now, daysAhead));
}

export function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDeliveryDate(dateValue: string): string {
  if (!dateValue) return "";
  const date = new Date(`${dateValue}T00:00:00`);
  return date.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function formatDeliveryDateShort(dateValue: string): string {
  const date = new Date(`${dateValue}T00:00:00`);
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/** e.g. "Wed 24" — weekday + day number, for compact date chips. */
export function formatDeliveryDateWeekday(dateValue: string): string {
  const date = new Date(`${dateValue}T00:00:00`);
  const weekday = date.toLocaleDateString("en-IN", { weekday: "short" });
  return `${weekday} ${date.getDate()}`;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function isSunday(dateValue: string): boolean {
  return new Date(`${dateValue}T00:00:00`).getDay() === 0;
}

// Days since the most recent Monday (0 for Monday ... 6 for Sunday).
function mondayOffset(date: Date): number {
  return (date.getDay() + 6) % 7;
}

export function getMondayOf(date: Date): Date {
  return addDays(date, -mondayOffset(date));
}

function buildCalendarDay(
  date: Date,
  minDate: string,
  noServiceDates: string[],
  inMonth?: boolean
): CalendarDay {
  const dateValue = toDateInputValue(date);
  const sunday = isSunday(dateValue);
  const past = dateValue < minDate;
  const noService = noServiceDates.includes(dateValue);

  let reason: CalendarDay["reason"] = null;
  if (sunday) reason = "holiday";
  else if (past) reason = "past";
  else if (noService) reason = "unavailable";

  return {
    date: dateValue,
    dayName: date.toLocaleDateString("en-IN", { weekday: "short" }),
    dayNumber: date.getDate(),
    eligible: !sunday && !past && !noService,
    reason,
    inMonth,
  };
}

/**
 * A simple rolling sequence of `count` calendar days starting today, for
 * compact horizontal date-chip pickers (as opposed to a week/month grid).
 * Today itself is typically past the order cutoff and shown disabled,
 * same eligibility rules as everywhere else.
 */
export function getUpcomingDeliveryDays(
  minDate: string,
  noServiceDates: string[],
  count: number
): CalendarDay[] {
  const today = new Date();
  return Array.from({ length: count }, (_, i) =>
    buildCalendarDay(addDays(today, i), minDate, noServiceDates)
  );
}

/** Monday through Sunday of the current week (Sunday always ineligible). */
export function getCurrentWeekDays(
  minDate: string,
  noServiceDates: string[] = []
): CalendarDay[] {
  const monday = getMondayOf(new Date());
  return Array.from({ length: 7 }, (_, i) =>
    buildCalendarDay(addDays(monday, i), minDate, noServiceDates)
  );
}

/** e.g. "Mon 28 Sep – Sat 3 Oct" — a week's range for plan-first pickers. */
export function formatWeekRangeLabel(startMonday: string): string {
  const saturday = toDateInputValue(addDays(new Date(`${startMonday}T00:00:00`), 5));
  return `${formatDeliveryDateWeekday(startMonday)} ${monthShort(startMonday)} – ${formatDeliveryDateWeekday(saturday)} ${monthShort(saturday)}`;
}

function monthShort(dateValue: string): string {
  return new Date(`${dateValue}T00:00:00`).toLocaleDateString("en-IN", { month: "short" });
}

/** The next `count` Mondays that are on/after minDate, for the weekly start picker. */
export function getUpcomingMondays(minDate: string, count: number): string[] {
  let monday = getMondayOf(new Date(`${minDate}T00:00:00`));
  if (toDateInputValue(monday) < minDate) monday = addDays(monday, 7);
  return Array.from({ length: count }, (_, i) =>
    toDateInputValue(addDays(monday, i * 7))
  );
}

/** Monday-to-Saturday dates for `weekCount` consecutive weeks starting at `startMonday`. */
export function getWeeklyScheduleDates(
  startMonday: string,
  weekCount: number
): string[] {
  const monday = new Date(`${startMonday}T00:00:00`);
  const dates: string[] = [];
  for (let w = 0; w < weekCount; w++) {
    for (let i = 0; i < 6; i++) {
      dates.push(toDateInputValue(addDays(monday, w * 7 + i)));
    }
  }
  return dates;
}

/**
 * Monday-to-Saturday of the week starting `startMonday`, with eligibility
 * flags (past / holiday / no-service), same rules as every other picker.
 */
export function getWeekDeliveryDays(
  startMonday: string,
  minDate: string,
  noServiceDates: string[] = []
): CalendarDay[] {
  return getWeeklyScheduleDates(startMonday, 1).map((date) =>
    buildCalendarDay(new Date(`${date}T00:00:00`), minDate, noServiceDates)
  );
}

/** Upcoming months (this month + `count` - 1 more) for the monthly picker. */
export function getUpcomingMonthOptions(
  count: number
): { year: number; month: number; label: string }[] {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    return {
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      label: d.toLocaleDateString("en-IN", { month: "long", year: "numeric" }),
    };
  });
}

/** Every Monday that falls within the given month, with eligibility flags. */
export function getMondaysInMonth(
  year: number,
  month: number,
  minDate: string,
  noServiceDates: string[] = []
): CalendarDay[] {
  const daysInMonth = new Date(year, month, 0).getDate();
  const mondays: CalendarDay[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month - 1, day);
    if (date.getDay() !== 1) continue;
    mondays.push(buildCalendarDay(date, minDate, noServiceDates));
  }
  return mondays;
}

/** Full calendar grid (Monday-start weeks) for a given month, with padding days from adjacent months marked as out-of-month. */
export function getMonthGrid(
  year: number,
  month: number,
  minDate: string,
  noServiceDates: string[] = []
): CalendarDay[][] {
  const firstOfMonth = new Date(year, month - 1, 1);
  const lastOfMonth = new Date(year, month, 0);
  const gridStart = getMondayOf(firstOfMonth);
  const gridEnd = addDays(getMondayOf(lastOfMonth), 6);

  const weeks: CalendarDay[][] = [];
  let week: CalendarDay[] = [];
  let cursor = gridStart;
  while (cursor <= gridEnd) {
    week.push(
      buildCalendarDay(
        cursor,
        minDate,
        noServiceDates,
        cursor.getMonth() === month - 1
      )
    );
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
    cursor = addDays(cursor, 1);
  }
  return weeks;
}
