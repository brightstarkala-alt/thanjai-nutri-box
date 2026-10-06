"use client";

import { useMemo, useState } from "react";
import { CalendarDays, CalendarRange, LoaderCircle, Sun } from "lucide-react";
import { OrderHeader } from "@/components/order/OrderHeader";
import { OrderHero } from "@/components/order/OrderHero";
import { StepTitle } from "@/components/order/StepTitle";
import { PlanCard } from "@/components/order/PlanCard";
import { DayChipGrid } from "@/components/order/DayChipGrid";
import { OptionCard } from "@/components/order/OptionCard";
import { BoxQuantityCard } from "@/components/order/BoxOptionCard";
import { AddOnList } from "@/components/order/AddOnList";
import { WeekCustomizer } from "@/components/order/WeekCustomizer";
import { EmptyHint, MenuNotReady } from "@/components/order/EmptyHint";
import { OrderSummaryPanel } from "@/components/order/OrderSummaryPanel";
import { dayShortOf } from "@/components/order/dayLabels";
import { EMPTY_DELIVERY_DETAILS, OrderReview, type DeliveryDetails } from "@/components/order/OrderReview";
import {
  EMPTY_PAYMENT_DRAFT,
  PaymentStep,
  type PaymentDraft,
  type SubmittedPayment,
} from "@/components/order/PaymentStep";
import { OrderConfirmation, type ScreenshotUploadStatus } from "@/components/order/OrderConfirmation";
import { createClient } from "@/lib/supabase/client";
import {
  OrderSubmitError,
  placeCustomerOrder,
  uploadPaymentScreenshot,
  type PlacedOrder,
} from "@/lib/supabase/place-order";
import { useMenu } from "@/components/providers/MenuProvider";
import { formatINR } from "@/lib/business-logic/pricing";
import {
  buildUniformSelections,
  calculateDateSubtotal,
  getDateSelection,
  summarizePlan,
  withAddOnQuantity,
  withBoxQuantity,
  withBoxQuantityAutoSkip,
  EMPTY_DATE_SELECTION,
  type DateSelection,
  type DateSelections,
  type PlanTotals,
} from "@/lib/business-logic/daily-order";
import {
  formatDeliveryDate,
  formatDeliveryDateShort,
  formatWeekRangeLabel,
  getMinDeliveryDate,
  getMonthGrid,
  getUpcomingDeliveryDays,
  getUpcomingMondays,
  getUpcomingMonthOptions,
  getWeekDeliveryDays,
} from "@/lib/business-logic/delivery-date";
import type { BoxDisplay, BoxId } from "@/lib/types";

type Plan = "daily" | "weekly" | "monthly";
type MonthOption = { year: number; month: number; label: string };

function isOrderable(box: BoxDisplay): boolean {
  return box.available && box.price != null;
}

/** "06:00:00" + "08:00:00" -> "6–8 AM"; null until business_settings load. */
function formatDeliveryWindow(start?: string, end?: string): string | null {
  if (!start || !end) return null;
  const parse = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return { hour: h % 12 || 12, minute: m ? `:${String(m).padStart(2, "0")}` : "", meridiem: h < 12 ? "AM" : "PM" };
  };
  const s = parse(start);
  const e = parse(end);
  return s.meridiem === e.meridiem
    ? `${s.hour}${s.minute}–${e.hour}${e.minute} ${e.meridiem}`
    : `${s.hour}${s.minute} ${s.meridiem}–${e.hour}${e.minute} ${e.meridiem}`;
}

export default function OrderPage() {
  const { getBoxDisplay, getAddOns, boxIdentities, businessSettings, noServiceDates, loading, error } =
    useMenu();
  const cutoffTime = businessSettings?.defaultCutoffTime ?? null;
  const minDate = useMemo(() => getMinDeliveryDate(cutoffTime), [cutoffTime]);
  const deliveryWindow = formatDeliveryWindow(
    businessSettings?.deliveryStartTime,
    businessSettings?.deliveryEndTime
  );

  const [plan, setPlan] = useState<Plan>("daily");
  const [continueAttempted, setContinueAttempted] = useState(false);
  // Checkout steps (all plans). All selection state stays in this
  // component, so moving between steps never loses dates, quantities or add-ons.
  const [step, setStep] = useState<"select" | "review" | "payment" | "confirmed">("select");
  // The order exactly as the database saved it (shown on Order Confirmation).
  const [placedOrder, setPlacedOrder] = useState<PlacedOrder | null>(null);
  const [screenshotStatus, setScreenshotStatus] = useState<ScreenshotUploadStatus>("uploading");
  const [deliveryDetails, setDeliveryDetails] = useState<DeliveryDetails>(EMPTY_DELIVERY_DETAILS);
  // Payment screenshot + extracted details; kept here so Back to Review and
  // forward again don't lose them.
  const [paymentDraft, setPaymentDraft] = useState<PaymentDraft>(EMPTY_PAYMENT_DRAFT);

  const boxesFor = (date: string) => boxIdentities.map((i) => getBoxDisplay(i.id, date));

  // ---------- Daily ----------
  // Selected delivery dates (sorted), and each date's own box/add-on
  // quantities. A removed date keeps its entry in dailySelections so
  // re-selecting it restores what the customer had; only dates in
  // dailySelectedDates count towards the order.
  const [dailySelectedDates, setDailySelectedDates] = useState<string[]>([]);
  const [dailySelections, setDailySelections] = useState<DateSelections>({});
  const [showMoreDailyDates, setShowMoreDailyDates] = useState(false);

  const dailyDays = useMemo(
    () => getUpcomingDeliveryDays(minDate, noServiceDates, showMoreDailyDates ? 42 : 13),
    [minDate, noServiceDates, showMoreDailyDates]
  );

  // ---------- Weekly ----------
  const upcomingMondays = useMemo(() => getUpcomingMondays(minDate, 6), [minDate]);
  const [weekMonday, setWeekMonday] = useState<string | null>(null);
  // Standard: independent Box 1 / Box 2 / add-on quantities applied to
  // every eligible day — { boxes: { "box-1", "box-2" }, addOns: {...} }.
  const [weeklyStandard, setWeeklyStandard] = useState<DateSelection>(EMPTY_DATE_SELECTION);
  const [weeklyCustomizing, setWeeklyCustomizing] = useState(false);
  // "Customize this week": each delivery day's own Box 1 / Box 2 / add-on
  // quantities — the same per-date model as Daily. A day with no boxes is
  // skipped; there is no separate skip state.
  const [weeklySelections, setWeeklySelections] = useState<DateSelections>({});

  // Mon–Sat of the chosen week; holidays / no-service days are flagged
  // ineligible and never get a delivery.
  const weekDays = useMemo(
    () => (weekMonday ? getWeekDeliveryDays(weekMonday, minDate, noServiceDates) : []),
    [weekMonday, minDate, noServiceDates]
  );
  const weekEligibleDates = weekDays.filter((d) => d.eligible).map((d) => d.date);

  // ---------- Monthly ----------
  const monthOptions = useMemo(() => getUpcomingMonthOptions(3), []);
  const monthOptionsWithCounts = useMemo(
    () =>
      monthOptions.map((opt) => {
        // getMonthGrid applies minDate, so the current month only counts
        // its remaining eligible delivery days.
        const grid = getMonthGrid(opt.year, opt.month, minDate, noServiceDates);
        const eligibleCount = grid.flat().filter((d) => d.eligible && d.inMonth).length;
        return { ...opt, eligibleCount };
      }),
    [monthOptions, minDate, noServiceDates]
  );
  const [monthSelection, setMonthSelection] = useState<MonthOption | null>(null);
  // Same two modes as Weekly: standard (independent Box 1 / Box 2 / add-on
  // quantities on every eligible date) or customized per date (DateSelections).
  const [monthlyStandard, setMonthlyStandard] = useState<DateSelection>(EMPTY_DATE_SELECTION);
  const [monthlyCustomizing, setMonthlyCustomizing] = useState(false);
  const [monthlySelections, setMonthlySelections] = useState<DateSelections>({});

  // Eligible delivery dates of the chosen month (no Sundays, holidays,
  // no-service or past dates; the current month only has what's left).
  const monthlyEligibleDays = useMemo(() => {
    if (!monthSelection) return [];
    const grid = getMonthGrid(monthSelection.year, monthSelection.month, minDate, noServiceDates);
    return grid.flat().filter((d) => d.eligible && d.inMonth);
  }, [monthSelection, minDate, noServiceDates]);
  const monthlyEligibleDates = monthlyEligibleDays.map((d) => d.date);

  // ---------- Plan switching ----------
  function resetFlowState() {
    setDailySelectedDates([]);
    setDailySelections({});
    setStep("select");
    setWeekMonday(null);
    setWeeklyStandard(EMPTY_DATE_SELECTION);
    setWeeklyCustomizing(false);
    setWeeklySelections({});
    setMonthSelection(null);
    setMonthlyStandard(EMPTY_DATE_SELECTION);
    setMonthlyCustomizing(false);
    setMonthlySelections({});
    setContinueAttempted(false);
    // A different plan is a different order: drop any payment screenshot.
    if (paymentDraft.previewUrl) URL.revokeObjectURL(paymentDraft.previewUrl);
    setPaymentDraft(EMPTY_PAYMENT_DRAFT);
  }

  function selectPlan(next: Plan) {
    if (next === plan) return;
    resetFlowState();
    setPlan(next);
  }

  // ---------- Daily handlers ----------
  function toggleDailyDate(date: string) {
    setDailySelectedDates((prev) =>
      prev.includes(date) ? prev.filter((d) => d !== date) : [...prev, date].sort()
    );
    setContinueAttempted(false);
  }
  function setDailyBoxQuantity(date: string, boxId: BoxId, quantity: number) {
    setDailySelections((prev) => withBoxQuantity(prev, date, boxId, quantity));
  }
  function setDailyAddOnQuantity(date: string, addOnId: string, quantity: number) {
    setDailySelections((prev) => withAddOnQuantity(prev, date, addOnId, quantity));
  }

  // ---------- Weekly handlers ----------
  function selectWeek(monday: string) {
    setWeekMonday(monday);
    setWeeklyStandard(EMPTY_DATE_SELECTION);
    setWeeklyCustomizing(false);
    setWeeklySelections({});
    setContinueAttempted(false);
  }
  // Box 1 and Box 2 are independent: changing one never touches the other.
  function setWeeklyStandardBox(boxId: BoxId, quantity: number) {
    setWeeklyStandard((prev) => ({ ...prev, boxes: { ...prev.boxes, [boxId]: quantity } }));
  }
  function setWeeklyStandardAddOn(addOnId: string, quantity: number) {
    setWeeklyStandard((prev) => ({ ...prev, addOns: { ...prev.addOns, [addOnId]: quantity } }));
  }
  function startWeeklyCustomize() {
    // First time for this week: seed every delivery day from the standard
    // choice so customizing starts from what they had. Coming back to
    // customize later keeps the per-day quantities already set.
    if (Object.keys(weeklySelections).length === 0) setWeeklySelections(weeklyStandardSelections);
    setWeeklyCustomizing(true);
    setContinueAttempted(false);
  }
  function setWeeklyBoxQuantity(date: string, boxId: BoxId, quantity: number) {
    setWeeklySelections((prev) => withBoxQuantityAutoSkip(prev, date, boxId, quantity));
  }
  function setWeeklyAddOnQuantity(date: string, addOnId: string, quantity: number) {
    setWeeklySelections((prev) => withAddOnQuantity(prev, date, addOnId, quantity));
  }

  // ---------- Monthly handlers ----------
  function selectMonth(opt: MonthOption) {
    setMonthSelection(opt);
    setMonthlyStandard(EMPTY_DATE_SELECTION);
    setMonthlyCustomizing(false);
    setMonthlySelections({});
    setContinueAttempted(false);
  }
  function setMonthlyStandardBox(boxId: BoxId, quantity: number) {
    setMonthlyStandard((prev) => ({ ...prev, boxes: { ...prev.boxes, [boxId]: quantity } }));
  }
  function setMonthlyStandardAddOn(addOnId: string, quantity: number) {
    setMonthlyStandard((prev) => ({ ...prev, addOns: { ...prev.addOns, [addOnId]: quantity } }));
  }
  function startMonthlyCustomize() {
    // Same seeding rule as Weekly.
    if (Object.keys(monthlySelections).length === 0) setMonthlySelections(monthlyStandardSelections);
    setMonthlyCustomizing(true);
    setContinueAttempted(false);
  }
  function setMonthlyBoxQuantity(date: string, boxId: BoxId, quantity: number) {
    setMonthlySelections((prev) => withBoxQuantityAutoSkip(prev, date, boxId, quantity));
  }
  function setMonthlyAddOnQuantity(date: string, addOnId: string, quantity: number) {
    setMonthlySelections((prev) => withAddOnQuantity(prev, date, addOnId, quantity));
  }

  // ---------- Daily totals ----------
  // Each selected date is priced against its own menu; the order total
  // is the sum of every date's box + add-on subtotal.
  const dailyDateDetails = dailySelectedDates.map((date) => {
    const boxes = boxesFor(date);
    const addOns = getAddOns(date);
    const selection = getDateSelection(dailySelections, date);
    return {
      date,
      boxes,
      addOns,
      selection,
      hasMenu: boxes.some(isOrderable),
      subtotal: calculateDateSubtotal(date, selection, boxes, addOns),
    };
  });
  const dailyBoxCount = dailyDateDetails.reduce((sum, d) => sum + d.subtotal.boxCount, 0);
  const dailyBoxTotal = dailyDateDetails.reduce((sum, d) => sum + d.subtotal.boxTotal, 0);
  const dailyAddOnTotal = dailyDateDetails.reduce((sum, d) => sum + d.subtotal.addOnTotal, 0);
  const dailyTotal = dailyBoxTotal + dailyAddOnTotal;
  const shortDate = (date: string) => `${dayShortOf(date)} ${formatDeliveryDateShort(date)}`;

  // ---------- Weekly totals ----------
  // Box cards and add-ons for the whole week are shown from the first
  // delivery day that has a published menu.
  const weeklyRepresentativeDate =
    weekEligibleDates.find((date) => boxesFor(date).some(isOrderable)) ?? null;
  const weeklyRepresentativeBoxes = weeklyRepresentativeDate ? boxesFor(weeklyRepresentativeDate) : [];
  const weeklyHasMenu = weeklyRepresentativeDate != null;
  const weeklyAddOns = weeklyRepresentativeDate ? getAddOns(weeklyRepresentativeDate) : [];

  // Both modes become per-date selections priced by calculateDateSubtotal
  // (via summarizePlan) — the same pricing path as Daily. Standard mode is
  // just the every-day Box 1 / Box 2 / extras copied onto each eligible day.
  const weeklyStandardSelections = buildUniformSelections(weekEligibleDates, weeklyStandard, boxesFor);
  const weeklyPlan = summarizePlan(
    weekEligibleDates,
    weeklyCustomizing ? weeklySelections : weeklyStandardSelections,
    boxesFor,
    getAddOns
  );
  const weeklyCustomByDate = new Map(weeklyPlan.days.map((d) => [d.date, d]));

  // ---------- Monthly totals ----------
  const monthlyRepresentativeDate =
    monthlyEligibleDates.find((date) => boxesFor(date).some(isOrderable)) ?? null;
  const monthlyRepresentativeBoxes = monthlyRepresentativeDate ? boxesFor(monthlyRepresentativeDate) : [];
  const monthlyHasMenu = monthlyRepresentativeDate != null;
  const monthlyAddOns = monthlyRepresentativeDate ? getAddOns(monthlyRepresentativeDate) : [];

  const monthlyStandardSelections = buildUniformSelections(monthlyEligibleDates, monthlyStandard, boxesFor);
  const monthlyPlan = summarizePlan(
    monthlyEligibleDates,
    monthlyCustomizing ? monthlySelections : monthlyStandardSelections,
    boxesFor,
    getAddOns
  );
  const monthlyCustomByDate = new Map(monthlyPlan.days.map((d) => [d.date, d]));

  // ---------- Summary / validation ----------
  const withAddOns = (base: string, addOnTotal: number) =>
    addOnTotal > 0 ? `${base} + ${formatINR(addOnTotal)} add-ons` : base;

  let summaryLines: string[] = [];
  let breakdown: string | undefined;
  let total = 0;
  let missing: string | null = null;

  if (plan === "daily") {
    total = dailyTotal;
    const noMenu = dailyDateDetails.find((d) => !d.hasMenu);
    const noBoxes = dailyDateDetails.find((d) => d.hasMenu && d.subtotal.boxCount === 0);
    if (dailySelectedDates.length === 0) missing = "Choose at least one delivery date.";
    else if (noMenu) missing = `There's no menu yet for ${shortDate(noMenu.date)}. Remove that date to continue.`;
    else if (noBoxes) missing = `Add at least one box for ${shortDate(noBoxes.date)}, or remove that date.`;
    if (dailySelectedDates.length > 0) {
      const n = dailySelectedDates.length;
      summaryLines = [
        `${n} delivery date${n === 1 ? "" : "s"} · ${dailyBoxCount} box${dailyBoxCount === 1 ? "" : "es"}`,
        ...dailyDateDetails.map(({ date, subtotal }) => {
          const items = [...subtotal.boxLines, ...subtotal.addOnLines].map((l) => `${l.name} × ${l.quantity}`);
          return `${shortDate(date)}: ${items.length ? `${items.join(", ")} · ${formatINR(subtotal.total)}` : "nothing added yet"}`;
        }),
      ];
      if (dailyAddOnTotal > 0) breakdown = withAddOns(`Boxes ${formatINR(dailyBoxTotal)}`, dailyAddOnTotal);
    }
  } else {
    // Weekly and Monthly share the same summary + validation rules.
    const isWeekly = plan === "weekly";
    const periodLabel = isWeekly
      ? weekMonday && formatWeekRangeLabel(weekMonday)
      : monthSelection?.label;
    const planTotals: PlanTotals = isWeekly ? weeklyPlan : monthlyPlan;
    const customizing = isWeekly ? weeklyCustomizing : monthlyCustomizing;
    const everyDay = isWeekly ? weeklyStandard : monthlyStandard;
    const addOns = isWeekly ? weeklyAddOns : monthlyAddOns;
    const boxes = isWeekly ? weeklyRepresentativeBoxes : monthlyRepresentativeBoxes;
    const unit = isWeekly ? "day" : "date";
    const n = planTotals.deliveries.length;

    total = planTotals.total;
    // Add-ons alone never make a delivery: a customized date with extras
    // but no box must get a box or lose its extras.
    if (!periodLabel) missing = isWeekly ? "Choose a week." : "Choose a month.";
    else if (n === 0)
      missing = customizing ? `Add at least one box on at least one ${unit}.` : "Add at least one Box 1 or Box 2.";
    else if (planTotals.extrasOnly)
      missing = `Add a box for ${shortDate(planTotals.extrasOnly.date)}, or remove its extras.`;

    if (periodLabel) summaryLines = [`${isWeekly ? "Weekly" : "Monthly"} · ${periodLabel}`];
    if (n > 0) {
      const days = `${n} delivery ${isWeekly ? "day" : "date"}${n === 1 ? "" : "s"}`;
      if (customizing) {
        const skipped = planTotals.days.length - n;
        if (isWeekly) {
          summaryLines.push(
            ...planTotals.days.map((d) => {
              const items = [...d.boxLines, ...d.addOnLines].map((l) => `${l.name} × ${l.quantity}`);
              return `${shortDate(d.date)}: ${d.boxCount > 0 ? `${items.join(", ")} · ${formatINR(d.total)}` : "skipped"}`;
            })
          );
        } else {
          summaryLines.push(`Custom quantities per date${skipped > 0 ? ` · ${skipped} skipped` : ""}`);
        }
        breakdown = withAddOns(`${days} · boxes ${formatINR(planTotals.boxTotal)}`, planTotals.addOnTotal);
      } else {
        const items = [
          ...boxes.filter((b) => isOrderable(b) && (everyDay.boxes[b.id] ?? 0) > 0).map((b) => `${b.name} × ${everyDay.boxes[b.id]}`),
          ...addOns.filter((a) => a.available && (everyDay.addOns[a.id] ?? 0) > 0).map((a) => `${a.name} × ${everyDay.addOns[a.id]}`),
        ];
        summaryLines.push(`${items.join(", ")} per ${unit}`);
        const perDay = planTotals.deliveries[0].total;
        const uniform = planTotals.deliveries.every((d) => d.total === perDay);
        breakdown = uniform ? `${days} × ${formatINR(perDay)}` : days;
      }
    }
  }

  // What Order Review / Payment show for the active plan: only real
  // deliveries (dates with at least one box), from the same subtotals.
  const checkout =
    plan === "daily"
      ? { planLabel: "Daily order", periodLabel: undefined, dates: dailyDateDetails.map((d) => d.subtotal), total: dailyTotal }
      : plan === "weekly"
        ? {
            planLabel: "Weekly plan",
            periodLabel: weekMonday ? formatWeekRangeLabel(weekMonday) : undefined,
            dates: weeklyPlan.deliveries,
            total: weeklyPlan.total,
          }
        : {
            planLabel: "Monthly plan",
            periodLabel: monthSelection?.label,
            dates: monthlyPlan.deliveries,
            total: monthlyPlan.total,
          };

  function goToStep(next: typeof step) {
    setStep(next);
    window.scrollTo({ top: 0 });
  }

  // Submit Payment: place the order through the secure database function
  // (which recalculates every price and the total), then upload the
  // screenshot to the private path it reserved, then show confirmation.
  // On failure nothing changes here and PaymentStep shows the error.
  async function submitOrder(payment: SubmittedPayment, requestId: string) {
    const supabase = createClient();
    let placed: PlacedOrder;
    try {
      placed = await placeCustomerOrder(supabase, {
        requestId,
        planType: plan,
        customer: {
          name: deliveryDetails.name.trim(),
          mobile: deliveryDetails.mobile.trim(),
          address: deliveryDetails.address.trim(),
          instructions: deliveryDetails.instructions.trim(),
          latitude: deliveryDetails.pin?.latitude ?? null,
          longitude: deliveryDetails.pin?.longitude ?? null,
        },
        dates: checkout.dates,
        payment: { ...payment },
      });
    } catch (err) {
      if (err instanceof OrderSubmitError && err.serverTotal != null) {
        throw new Error(
          `The paid amount doesn't match the order total of ${formatINR(err.serverTotal)}. ` +
            "Prices may have changed — please go back to Review and check your order."
        );
      }
      throw err;
    }
    setScreenshotStatus("uploading");
    const uploaded = await uploadPaymentScreenshot(supabase, placed.screenshotUploadPath, payment.screenshot);
    setScreenshotStatus(uploaded ? "uploaded" : "failed");
    setPlacedOrder(placed);
    goToStep("confirmed");
  }

  async function retryScreenshotUpload() {
    if (!placedOrder || !paymentDraft.file) return;
    setScreenshotStatus("uploading");
    const uploaded = await uploadPaymentScreenshot(createClient(), placedOrder.screenshotUploadPath, paymentDraft.file);
    setScreenshotStatus(uploaded ? "uploaded" : "failed");
  }

  // After an order is placed: start fresh (delivery details are kept for convenience).
  function startNewOrder() {
    resetFlowState();
    setPlacedOrder(null);
    goToStep("select");
  }

  // Any plan: a complete selection opens Order Review; otherwise show why not.
  function handleContinue() {
    if (missing == null) {
      setContinueAttempted(false);
      goToStep("review");
      return;
    }
    setContinueAttempted(true);
  }

  const linkButtonClass =
    "mt-4 text-sm font-medium text-leaf-deep underline underline-offset-2 hover:text-leaf";

  return (
    <div className="flex flex-1 flex-col bg-canvas font-body text-ink">
      <div className="mx-auto w-full max-w-4xl px-4 py-4 sm:px-6 sm:py-6">
        <OrderHeader deliveryWindow={deliveryWindow} />

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-20 text-ink-soft">
            <LoaderCircle className="size-5 animate-spin" /> Loading the menu…
          </div>
        ) : error ? (
          <div className="mx-auto mt-10 max-w-md rounded-2xl bg-surface p-6 text-center ring-1 ring-line-soft">
            <p className="font-semibold text-ink">We couldn&apos;t load the menu right now.</p>
            <p className="mt-1 text-sm text-ink-soft">Please try again shortly.</p>
          </div>
        ) : step === "confirmed" && placedOrder ? (
          <OrderConfirmation
            order={placedOrder}
            planLabel={checkout.planLabel}
            screenshotStatus={screenshotStatus}
            onRetryUpload={retryScreenshotUpload}
            onNewOrder={startNewOrder}
          />
        ) : step === "review" && missing == null ? (
          <OrderReview
            planLabel={checkout.planLabel}
            periodLabel={checkout.periodLabel}
            dates={checkout.dates}
            total={checkout.total}
            details={deliveryDetails}
            onDetailsChange={setDeliveryDetails}
            onBack={() => {
              // Going back to change the order makes the next submit a new checkout.
              setPaymentDraft((d) => ({ ...d, requestId: null }));
              goToStep("select");
            }}
            onContinue={() => goToStep("payment")}
          />
        ) : step === "payment" && missing == null ? (
          <PaymentStep
            planLabel={checkout.planLabel}
            periodLabel={checkout.periodLabel}
            total={checkout.total}
            dateCount={checkout.dates.length}
            details={deliveryDetails}
            upiId={businessSettings?.upiId ?? null}
            upiQrImageUrl={businessSettings?.upiQrImageUrl ?? null}
            draft={paymentDraft}
            setDraft={setPaymentDraft}
            onBack={() => goToStep("review")}
            onSubmit={submitOrder}
          />
        ) : (
          <section className="animate-float-in py-6 sm:py-8">
            <OrderHero deliveryWindow={deliveryWindow} />

            {/* Step 1 — plan */}
            <div className="mt-8">
              <StepTitle number={1} title="How would you like your box?" />
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <PlanCard
                  icon={<Sun />}
                  title="Daily"
                  note="Just for a day"
                  selected={plan === "daily"}
                  onClick={() => selectPlan("daily")}
                />
                <PlanCard
                  icon={<CalendarRange />}
                  title="Weekly"
                  note="Every day, Monday to Saturday"
                  selected={plan === "weekly"}
                  onClick={() => selectPlan("weekly")}
                />
                <PlanCard
                  icon={<CalendarDays />}
                  title="Monthly"
                  note="Your healthy routine · skip any day"
                  selected={plan === "monthly"}
                  onClick={() => selectPlan("monthly")}
                />
              </div>
            </div>

            {/* Step 2 — when */}
            <div className="mt-8">
              <StepTitle
                number={2}
                title={
                  plan === "daily"
                    ? "When do you need it?"
                    : plan === "weekly"
                      ? "Choose your week"
                      : "Choose your month"
                }
              />

              {plan === "daily" && (
                <>
                  <DayChipGrid
                    days={dailyDays}
                    selectedDates={dailySelectedDates}
                    onToggle={toggleDailyDate}
                    canShowMore={!showMoreDailyDates}
                    onShowMore={() => setShowMoreDailyDates(true)}
                  />
                  <p className="mt-3 text-sm text-ink-soft">
                    We deliver Monday to Saturday. Sunday is a holiday.
                  </p>
                </>
              )}

              {plan === "weekly" && (
                <>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {upcomingMondays.map((monday) => {
                      const count = getWeekDeliveryDays(monday, minDate, noServiceDates).filter(
                        (d) => d.eligible
                      ).length;
                      return (
                        <OptionCard
                          key={monday}
                          badge={String(new Date(`${monday}T00:00:00`).getDate())}
                          title={formatWeekRangeLabel(monday)}
                          subtitle={`${count} delivery day${count === 1 ? "" : "s"} · Mon–Sat`}
                          selected={weekMonday === monday}
                          disabled={count === 0}
                          onClick={() => selectWeek(monday)}
                        />
                      );
                    })}
                  </div>
                  <p className="mt-3 text-sm text-ink-soft">
                    Weekly plans run Monday to Saturday. Holidays are skipped automatically.
                  </p>
                </>
              )}

              {plan === "monthly" && (
                <>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {monthOptionsWithCounts.map((opt, i) => {
                      const isCurrent = i === 0;
                      return (
                        <OptionCard
                          key={`${opt.year}-${opt.month}`}
                          badge={new Date(opt.year, opt.month - 1, 1).toLocaleDateString("en-IN", {
                            month: "short",
                          })}
                          title={opt.label}
                          subtitle={`${opt.eligibleCount} delivery day${opt.eligibleCount === 1 ? "" : "s"}${
                            isCurrent ? " left this month" : ""
                          }`}
                          selected={
                            monthSelection?.year === opt.year && monthSelection?.month === opt.month
                          }
                          disabled={opt.eligibleCount === 0}
                          onClick={() => selectMonth(opt)}
                        />
                      );
                    })}
                  </div>
                  <p className="mt-3 text-sm text-ink-soft">
                    Every delivery day in the month, Monday to Saturday, except holidays.
                  </p>
                </>
              )}
            </div>

            {/* Step 3 — boxes */}
            <div className="mt-8">
              {plan === "daily" && (
                <>
                  <StepTitle
                    number={3}
                    title="Choose boxes for each date"
                    subtitle={dailySelectedDates.length > 0 ? "Each date has its own boxes and extras." : undefined}
                  />
                  {dailyDateDetails.length === 0 ? (
                    <EmptyHint text="Pick one or more delivery dates above." />
                  ) : (
                    <div className="mt-4 space-y-4">
                      {dailyDateDetails.map(({ date, boxes, addOns, selection, hasMenu, subtotal }) => (
                        <div key={date} className="rounded-2xl bg-surface p-4 ring-1 ring-line-soft">
                          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                            <div className="min-w-0">
                              <p className="text-base font-semibold text-ink">{formatDeliveryDate(date)}</p>
                              {hasMenu && (
                                <p className="text-sm text-ink-soft">
                                  {subtotal.boxCount} box{subtotal.boxCount === 1 ? "" : "es"} · {formatINR(subtotal.total)}
                                </p>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => toggleDailyDate(date)}
                              aria-label={`Remove ${formatDeliveryDate(date)}`}
                              className="shrink-0 rounded-lg px-3 py-2 text-sm text-ink-soft transition-colors hover:bg-surface-muted hover:text-ink"
                            >
                              Remove
                            </button>
                          </div>
                          {!hasMenu ? (
                            <MenuNotReady label={formatDeliveryDate(date)} />
                          ) : (
                            <>
                              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                {boxes.map((box) => (
                                  <BoxQuantityCard
                                    key={box.id}
                                    box={box}
                                    quantity={selection.boxes[box.id] ?? 0}
                                    onQuantityChange={(qty) => setDailyBoxQuantity(date, box.id, qty)}
                                  />
                                ))}
                              </div>
                              <AddOnList
                                addOns={addOns}
                                quantities={selection.addOns}
                                onQuantityChange={(id, qty) => setDailyAddOnQuantity(date, id, qty)}
                              />
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {plan === "weekly" && (
                <>
                  <StepTitle
                    number={3}
                    title={weeklyCustomizing ? "Choose boxes for each day" : "Choose your boxes for every day"}
                    subtitle={weekMonday ? formatWeekRangeLabel(weekMonday) : undefined}
                  />
                  {!weekMonday ? (
                    <EmptyHint text="Pick a week above." />
                  ) : !weeklyHasMenu ? (
                    <MenuNotReady label={formatWeekRangeLabel(weekMonday)} />
                  ) : (
                    <>
                      {weeklyCustomizing ? (
                        <>
                          <p className="mt-3 text-sm text-ink-soft">
                            Set quantities for each day. A day with no boxes is skipped.
                          </p>
                          <WeekCustomizer
                            days={weekDays}
                            getBoxesForDate={boxesFor}
                            getAddOnsForDate={getAddOns}
                            selectionFor={(date) => getDateSelection(weeklySelections, date)}
                            subtotalFor={(date) => weeklyCustomByDate.get(date)!}
                            onBoxChange={setWeeklyBoxQuantity}
                            onAddOnChange={setWeeklyAddOnQuantity}
                          />
                          <button type="button" onClick={() => setWeeklyCustomizing(false)} className={linkButtonClass}>
                            ← Use the same box every day
                          </button>
                        </>
                      ) : (
                        <>
                          <p className="mt-3 text-sm text-ink-soft">
                            These quantities apply to every delivery day. You can order both boxes.
                          </p>
                          <div className="mt-3 grid gap-3 sm:grid-cols-2">
                            {weeklyRepresentativeBoxes.map((box) => (
                              <BoxQuantityCard
                                key={box.id}
                                box={box}
                                priceSuffix="/day"
                                quantity={weeklyStandard.boxes[box.id] ?? 0}
                                onQuantityChange={(qty) => setWeeklyStandardBox(box.id, qty)}
                              />
                            ))}
                          </div>
                          <button type="button" onClick={startWeeklyCustomize} className={linkButtonClass}>
                            Want different boxes on different days? Customize this week →
                          </button>
                        </>
                      )}
                      {/* Every-day extras belong to the standard plan; customized
                          days set their own extras above. */}
                      {!weeklyCustomizing && (
                        <AddOnList
                          addOns={weeklyAddOns}
                          quantities={weeklyStandard.addOns}
                          onQuantityChange={setWeeklyStandardAddOn}
                          everyDayCaption
                          max={20}
                        />
                      )}
                    </>
                  )}
                </>
              )}

              {plan === "monthly" && (
                <>
                  <StepTitle
                    number={3}
                    title={monthlyCustomizing ? "Choose boxes for each date" : "Choose your boxes for every day"}
                    subtitle={
                      monthSelection
                        ? `${monthSelection.label} · ${monthlyEligibleDates.length} delivery day${
                            monthlyEligibleDates.length === 1 ? "" : "s"
                          }`
                        : undefined
                    }
                  />
                  {!monthSelection ? (
                    <EmptyHint text="Pick a month above." />
                  ) : !monthlyHasMenu ? (
                    <MenuNotReady label={monthSelection.label} />
                  ) : monthlyCustomizing ? (
                    <>
                      <p className="mt-3 text-sm text-ink-soft">
                        Set quantities for each date. A date with no boxes is skipped.
                      </p>
                      <WeekCustomizer
                        days={monthlyEligibleDays}
                        getBoxesForDate={boxesFor}
                        getAddOnsForDate={getAddOns}
                        selectionFor={(date) => getDateSelection(monthlySelections, date)}
                        subtotalFor={(date) => monthlyCustomByDate.get(date)!}
                        onBoxChange={setMonthlyBoxQuantity}
                        onAddOnChange={setMonthlyAddOnQuantity}
                      />
                      <button type="button" onClick={() => setMonthlyCustomizing(false)} className={linkButtonClass}>
                        ← Use the same box every day
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="mt-3 text-sm text-ink-soft">
                        These quantities apply to every delivery day. You can order both boxes.
                      </p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        {monthlyRepresentativeBoxes.map((box) => (
                          <BoxQuantityCard
                            key={box.id}
                            box={box}
                            priceSuffix="/day"
                            quantity={monthlyStandard.boxes[box.id] ?? 0}
                            onQuantityChange={(qty) => setMonthlyStandardBox(box.id, qty)}
                          />
                        ))}
                      </div>
                      <button type="button" onClick={startMonthlyCustomize} className={linkButtonClass}>
                        Want different boxes on different dates, or to skip some? Customize this month →
                      </button>
                      <AddOnList
                        addOns={monthlyAddOns}
                        quantities={monthlyStandard.addOns}
                        onQuantityChange={setMonthlyStandardAddOn}
                        everyDayCaption
                        max={20}
                      />
                    </>
                  )}
                </>
              )}
            </div>

            <OrderSummaryPanel
              lines={summaryLines}
              breakdown={breakdown}
              total={total}
              onContinue={handleContinue}
              validationMessage={continueAttempted ? missing : null}
              continueLabel="Continue to Order"
            />
          </section>
        )}
      </div>
    </div>
  );
}
