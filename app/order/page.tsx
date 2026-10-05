"use client";

import { useMemo, useState } from "react";
import { SiteHeader } from "@/components/shared/SiteHeader";
import { FreshIngredientsBanner } from "@/components/shared/FreshIngredientsBanner";
import { LeafIcon } from "@/components/shared/LeafIcon";
import { PlanTypeCard } from "@/components/shared/PlanTypeCard";
import { SunIcon, WeekIcon, MonthIcon } from "@/components/shared/PlanIcons";
import { StepHeader } from "@/components/shared/StepHeader";
import { DeliveryDateChips } from "@/components/shared/DeliveryDateChips";
import { PlanBoxOption } from "@/components/shared/PlanBoxOption";
import { AddOnsSection } from "@/components/shared/AddOnsSection";
import { WeeklyDayCustomizer } from "@/components/shared/WeeklyDayCustomizer";
import { MonthlyDateCustomizer } from "@/components/shared/MonthlyDateCustomizer";
import { OrderTotalBar } from "@/components/shared/OrderTotalBar";
import { useMenu } from "@/components/providers/MenuProvider";
import { calculateOrderTotal, formatINR } from "@/lib/business-logic/pricing";
import {
  formatDeliveryDate,
  formatWeekRangeLabel,
  getMinDeliveryDate,
  getMonthGrid,
  getUpcomingDeliveryDays,
  getUpcomingMondays,
  getUpcomingMonthOptions,
  getWeeklyScheduleDates,
} from "@/lib/business-logic/delivery-date";
import type { AddOnQuantities, BoxDisplay, BoxId } from "@/lib/types";

type Screen =
  | "plan"
  | "daily-date"
  | "daily-configure"
  | "weekly-week"
  | "weekly-configure"
  | "monthly-month"
  | "monthly-configure";

type MonthOption = { year: number; month: number; label: string };
type WeekDayChoice = BoxId | "skip";

export default function OrderPage() {
  const minDate = useMemo(() => getMinDeliveryDate(), []);
  const { getBoxDisplay, getAddOns, boxIdentities, noServiceDates, loading, error } = useMenu();

  const [screen, setScreen] = useState<Screen>("plan");
  const [showValidation, setShowValidation] = useState(false);

  // ---------- Daily ----------
  const [dailyDate, setDailyDate] = useState<string | null>(null);
  const [dailyBoxId, setDailyBoxId] = useState<BoxId | null>(null);
  const [dailyQuantity, setDailyQuantity] = useState(1);
  const [dailyAddOnQuantities, setDailyAddOnQuantities] = useState<AddOnQuantities>({});
  const [showMoreDailyDates, setShowMoreDailyDates] = useState(false);

  const dailyDays = useMemo(
    () => getUpcomingDeliveryDays(minDate, noServiceDates, showMoreDailyDates ? 45 : 14),
    [minDate, noServiceDates, showMoreDailyDates]
  );

  // ---------- Weekly ----------
  const upcomingMondays = useMemo(() => getUpcomingMondays(minDate, 6), [minDate]);
  const [weekMonday, setWeekMonday] = useState<string | null>(null);
  const [weeklyBoxId, setWeeklyBoxId] = useState<BoxId | null>(null);
  const [weeklyAddOnQuantities, setWeeklyAddOnQuantities] = useState<AddOnQuantities>({});
  const [weeklyCustomizing, setWeeklyCustomizing] = useState(false);
  const [weeklyDayChoices, setWeeklyDayChoices] = useState<Record<string, WeekDayChoice>>({});

  const weekDates = useMemo(
    () => (weekMonday ? getWeeklyScheduleDates(weekMonday, 1) : []),
    [weekMonday]
  );

  // ---------- Monthly ----------
  const monthOptions = useMemo(() => getUpcomingMonthOptions(3), []);
  const monthOptionsWithCounts = useMemo(
    () =>
      monthOptions.map((opt) => {
        const grid = getMonthGrid(opt.year, opt.month, minDate, noServiceDates);
        const eligibleCount = grid.flat().filter((d) => d.eligible && d.inMonth).length;
        return { ...opt, eligibleCount };
      }),
    [monthOptions, minDate, noServiceDates]
  );
  const [monthSelection, setMonthSelection] = useState<MonthOption | null>(null);
  const [monthlyBoxId, setMonthlyBoxId] = useState<BoxId | null>(null);
  const [monthlyAddOnQuantities, setMonthlyAddOnQuantities] = useState<AddOnQuantities>({});
  const [monthlyCustomizing, setMonthlyCustomizing] = useState(false);
  const [monthlySkippedDates, setMonthlySkippedDates] = useState<Set<string>>(new Set());

  const monthlyEligibleDates = useMemo(() => {
    if (!monthSelection) return [];
    const grid = getMonthGrid(monthSelection.year, monthSelection.month, minDate, noServiceDates);
    return grid.flat().filter((d) => d.eligible && d.inMonth).map((d) => d.date);
  }, [monthSelection, minDate, noServiceDates]);

  // ---------- Navigation ----------
  function resetFlowState() {
    setDailyDate(null);
    setDailyBoxId(null);
    setDailyQuantity(1);
    setDailyAddOnQuantities({});
    setWeekMonday(null);
    setWeeklyBoxId(null);
    setWeeklyAddOnQuantities({});
    setWeeklyCustomizing(false);
    setWeeklyDayChoices({});
    setMonthSelection(null);
    setMonthlyBoxId(null);
    setMonthlyAddOnQuantities({});
    setMonthlyCustomizing(false);
    setMonthlySkippedDates(new Set());
    setShowValidation(false);
  }

  function selectPlan(type: "daily" | "weekly" | "monthly") {
    resetFlowState();
    setScreen(type === "daily" ? "daily-date" : type === "weekly" ? "weekly-week" : "monthly-month");
  }

  function goBack() {
    setShowValidation(false);
    if (screen === "daily-date" || screen === "weekly-week" || screen === "monthly-month") {
      setScreen("plan");
    } else if (screen === "daily-configure") {
      setScreen("daily-date");
    } else if (screen === "weekly-configure") {
      setScreen("weekly-week");
    } else if (screen === "monthly-configure") {
      setScreen("monthly-month");
    }
  }

  // ---------- Daily handlers ----------
  function selectDailyDate(date: string) {
    setDailyDate(date);
    setDailyBoxId(null);
    setDailyQuantity(1);
    setDailyAddOnQuantities({});
    setShowValidation(false);
    setScreen("daily-configure");
  }
  function toggleDailyBox(boxId: BoxId) {
    setDailyBoxId((prev) => (prev === boxId ? null : boxId));
    setDailyQuantity(1);
  }
  function updateDailyAddOnQuantity(addOnId: string, quantity: number) {
    setDailyAddOnQuantities((prev) => ({ ...prev, [addOnId]: quantity }));
  }

  // ---------- Weekly handlers ----------
  function selectWeek(monday: string) {
    setWeekMonday(monday);
    setWeeklyBoxId(null);
    setWeeklyAddOnQuantities({});
    setWeeklyCustomizing(false);
    setWeeklyDayChoices({});
    setShowValidation(false);
    setScreen("weekly-configure");
  }
  function toggleWeeklyBox(boxId: BoxId) {
    setWeeklyBoxId((prev) => (prev === boxId ? null : boxId));
  }
  function toggleWeeklyCustomize() {
    setWeeklyCustomizing((prev) => {
      const next = !prev;
      if (next) {
        const seeded: Record<string, WeekDayChoice> = {};
        for (const date of weekDates) seeded[date] = weeklyBoxId ?? "skip";
        setWeeklyDayChoices(seeded);
      }
      return next;
    });
  }
  function updateWeeklyAddOnQuantity(addOnId: string, quantity: number) {
    setWeeklyAddOnQuantities((prev) => ({ ...prev, [addOnId]: quantity }));
  }

  // ---------- Monthly handlers ----------
  function selectMonth(opt: MonthOption) {
    setMonthSelection(opt);
    setMonthlyBoxId(null);
    setMonthlyAddOnQuantities({});
    setMonthlyCustomizing(false);
    setMonthlySkippedDates(new Set());
    setShowValidation(false);
    setScreen("monthly-configure");
  }
  function toggleMonthlyBox(boxId: BoxId) {
    setMonthlyBoxId((prev) => (prev === boxId ? null : boxId));
  }
  function toggleMonthlySkip(date: string) {
    setMonthlySkippedDates((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }
  function updateMonthlyAddOnQuantity(addOnId: string, quantity: number) {
    setMonthlyAddOnQuantities((prev) => ({ ...prev, [addOnId]: quantity }));
  }

  // ---------- Daily totals ----------
  const dailyBox: BoxDisplay | null =
    dailyDate && dailyBoxId ? getBoxDisplay(dailyBoxId, dailyDate) : null;
  const dailyBoxes = dailyDate ? boxIdentities.map((i) => getBoxDisplay(i.id, dailyDate)) : [];
  const dailyAddOns = dailyDate ? getAddOns(dailyDate) : [];
  const dailyHasMenu = dailyBoxes.some((b) => b.available && b.price != null);
  const dailyBoxTotal =
    dailyBox && dailyBox.available && dailyBox.price != null ? dailyBox.price * dailyQuantity : 0;
  const dailyAddOnTotal = calculateOrderTotal(
    dailyAddOns
      .filter((a) => (dailyAddOnQuantities[a.id] ?? 0) > 0 && a.available)
      .map((a) => ({ unitPrice: a.price, quantity: dailyAddOnQuantities[a.id] }))
  );
  const dailyTotal = dailyBoxTotal + dailyAddOnTotal;

  // ---------- Weekly totals ----------
  const weeklyRepresentativeBoxes = weekMonday
    ? boxIdentities.map((i) => getBoxDisplay(i.id, weekMonday))
    : [];
  const weeklyHasMenu = weeklyRepresentativeBoxes.some((b) => b.available && b.price != null);
  const weeklyAddOns = weekMonday ? getAddOns(weekMonday) : [];

  function resolveWeeklyChoice(date: string): WeekDayChoice {
    return weeklyCustomizing ? (weeklyDayChoices[date] ?? "skip") : (weeklyBoxId ?? "skip");
  }
  const weeklyLines = weekDates
    .map((date) => {
      const choice = resolveWeeklyChoice(date);
      if (choice === "skip") return null;
      const box = getBoxDisplay(choice, date);
      if (!box.available || box.price == null) return null;
      return { date, price: box.price };
    })
    .filter((l): l is { date: string; price: number } => l !== null);

  const weeklyDeliveryDayCount = weeklyLines.length;
  const weeklyBoxTotal = weeklyLines.reduce((sum, l) => sum + l.price, 0);
  const weeklyAddOnTotal = weeklyAddOns.reduce((sum, addOn) => {
    const qty = weeklyAddOnQuantities[addOn.id] ?? 0;
    if (qty <= 0 || !addOn.available || weeklyDeliveryDayCount === 0) return sum;
    return sum + addOn.price * qty * weeklyDeliveryDayCount;
  }, 0);
  const weeklyTotal = weeklyBoxTotal + weeklyAddOnTotal;
  const weeklyUniformPrice =
    !weeklyCustomizing && weeklyLines.length > 0 && weeklyLines.every((l) => l.price === weeklyLines[0].price)
      ? weeklyLines[0].price
      : null;

  // ---------- Monthly totals ----------
  const monthlyRepresentativeDate = monthlyEligibleDates[0] ?? null;
  const monthlyRepresentativeBoxes = monthlyRepresentativeDate
    ? boxIdentities.map((i) => getBoxDisplay(i.id, monthlyRepresentativeDate))
    : [];
  const monthlyHasMenu = monthlyRepresentativeBoxes.some((b) => b.available && b.price != null);
  const monthlyAddOns = monthlyRepresentativeDate ? getAddOns(monthlyRepresentativeDate) : [];

  const monthlyDatesForTotal = monthlyCustomizing
    ? monthlyEligibleDates.filter((d) => !monthlySkippedDates.has(d))
    : monthlyEligibleDates;
  const monthlyLines = monthlyBoxId
    ? monthlyDatesForTotal
        .map((date) => getBoxDisplay(monthlyBoxId, date))
        .filter((b) => b.available && b.price != null)
        .map((b) => b.price as number)
    : [];
  const monthlyDeliveryDayCount = monthlyLines.length;
  const monthlyBoxTotal = monthlyLines.reduce((sum, p) => sum + p, 0);
  const monthlyAddOnTotal = monthlyAddOns.reduce((sum, addOn) => {
    const qty = monthlyAddOnQuantities[addOn.id] ?? 0;
    if (qty <= 0 || !addOn.available || monthlyDeliveryDayCount === 0) return sum;
    return sum + addOn.price * qty * monthlyDeliveryDayCount;
  }, 0);
  const monthlyTotal = monthlyBoxTotal + monthlyAddOnTotal;
  const monthlyUniformPrice =
    monthlyLines.length > 0 && monthlyLines.every((p) => p === monthlyLines[0]) ? monthlyLines[0] : null;

  // ---------- Continue / validation ----------
  function handleContinue() {
    setShowValidation(true);
  }

  if (loading) {
    return (
      <div className="flex flex-1 flex-col bg-[#FBF9F4]">
        <SiteHeader />
        <main className="flex flex-1 items-center justify-center px-6 py-10">
          <p className="text-sm text-foreground/50">Loading the menu…</p>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 flex-col bg-[#FBF9F4]">
        <SiteHeader />
        <main className="mx-auto w-full max-w-xl flex-1 px-6 py-10 text-center">
          <p className="text-sm text-foreground/70">
            We couldn&apos;t load the menu right now. Please try again shortly.
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col bg-[#FBF9F4]">
      <SiteHeader />

      <main className="mx-auto w-full max-w-xl flex-1 px-4 pb-10 pt-5">
        {screen === "plan" && (
          <>
            <FreshIngredientsBanner />
            <div className="mt-5">
              <h1 className="text-xl font-semibold text-foreground">Thanjai Healthy Plate</h1>
              <p className="mt-1 text-sm text-foreground/60">Fresh. Healthy. Every day.</p>
            </div>

            <section className="mt-7">
              <h2 className="text-base font-medium text-foreground">How would you like your box?</h2>
              <div className="mt-3 flex flex-col gap-3">
                <PlanTypeCard
                  title="Daily"
                  subtitle="Just for a day"
                  icon={<SunIcon />}
                  onSelect={() => selectPlan("daily")}
                />
                <PlanTypeCard
                  title="Weekly"
                  subtitle="One box every day · Mon–Sat"
                  icon={<WeekIcon />}
                  onSelect={() => selectPlan("weekly")}
                />
                <PlanTypeCard
                  title="Monthly"
                  subtitle="Your healthy routine"
                  icon={<MonthIcon />}
                  onSelect={() => selectPlan("monthly")}
                />
              </div>
            </section>
          </>
        )}

        {screen === "daily-date" && (
          <>
            <StepHeader planLabel="Daily" title="When do you need it?" onBack={goBack} />
            <DeliveryDateChips
              days={dailyDays}
              selectedDates={dailyDate ? [dailyDate] : []}
              activeDate={dailyDate}
              onToggle={selectDailyDate}
              canShowMore={!showMoreDailyDates}
              onShowMore={() => setShowMoreDailyDates(true)}
            />
          </>
        )}

        {screen === "daily-configure" && dailyDate && (
          <>
            <StepHeader planLabel="Daily" title="Choose your box" onBack={goBack} />
            <p className="-mt-3 mb-4 text-sm text-foreground/60">{formatDeliveryDate(dailyDate)}</p>

            {!dailyHasMenu ? (
              <EmptyMenuState label={formatDeliveryDate(dailyDate)} />
            ) : (
              <div className="flex flex-col gap-3">
                {dailyBoxes.map((box) => (
                  <PlanBoxOption
                    key={box.id}
                    box={box}
                    selected={dailyBoxId === box.id}
                    onSelect={() => toggleDailyBox(box.id)}
                    quantity={dailyBoxId === box.id ? dailyQuantity : undefined}
                    onQuantityChange={dailyBoxId === box.id ? setDailyQuantity : undefined}
                  />
                ))}
              </div>
            )}

            <AddOnsSection
              addOns={dailyAddOns}
              quantities={dailyAddOnQuantities}
              onQuantityChange={updateDailyAddOnQuantity}
            />

            <div className="mt-8 rounded-2xl border border-stone-200 bg-white p-4">
              <OrderTotalBar
                summary={
                  dailyBox
                    ? `${formatDeliveryDate(dailyDate)} · ${dailyBox.name}${dailyQuantity > 1 ? ` × ${dailyQuantity}` : ""}`
                    : "Choose a box to continue"
                }
                total={dailyTotal}
                onContinue={handleContinue}
                validationMessage={
                  showValidation && !dailyBoxId ? "Choose a box to continue." : null
                }
              />
            </div>
          </>
        )}

        {screen === "weekly-week" && (
          <>
            <StepHeader planLabel="Weekly" title="Choose your week" onBack={goBack} />
            <div className="flex flex-col gap-2">
              {upcomingMondays.map((monday) => (
                <button
                  key={monday}
                  type="button"
                  onClick={() => selectWeek(monday)}
                  className="rounded-2xl border border-stone-200 bg-white px-4 py-3.5 text-left text-sm font-medium text-foreground transition-colors hover:border-brand/50 hover:bg-brand-light/40"
                >
                  {formatWeekRangeLabel(monday)}
                </button>
              ))}
            </div>
          </>
        )}

        {screen === "weekly-configure" && weekMonday && (
          <>
            <StepHeader
              planLabel="Weekly"
              title={weeklyCustomizing ? "Customize your week" : "Choose your box for the week"}
              onBack={goBack}
            />
            <p className="-mt-3 mb-4 text-sm text-foreground/60">{formatWeekRangeLabel(weekMonday)}</p>

            {!weeklyHasMenu ? (
              <EmptyMenuState label={formatWeekRangeLabel(weekMonday)} />
            ) : weeklyCustomizing ? (
              <WeeklyDayCustomizer
                weekDates={weekDates}
                getBoxesForDate={(date) => boxIdentities.map((i) => getBoxDisplay(i.id, date))}
                choices={weeklyDayChoices}
                onChange={(date, value) =>
                  setWeeklyDayChoices((prev) => ({ ...prev, [date]: value }))
                }
              />
            ) : (
              <>
                <div className="flex flex-col gap-3">
                  {weeklyRepresentativeBoxes.map((box) => (
                    <PlanBoxOption
                      key={box.id}
                      box={box}
                      selected={weeklyBoxId === box.id}
                      onSelect={() => toggleWeeklyBox(box.id)}
                      priceSuffix="/day"
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={toggleWeeklyCustomize}
                  className="mt-4 text-sm font-medium text-brand-dark underline underline-offset-2"
                >
                  Want a different box on different days? Customize this week →
                </button>
              </>
            )}

            {weeklyCustomizing && (
              <button
                type="button"
                onClick={toggleWeeklyCustomize}
                className="mt-4 text-sm font-medium text-brand-dark underline underline-offset-2"
              >
                ← Use the same box every day
              </button>
            )}

            <AddOnsSection
              addOns={weeklyAddOns}
              quantities={weeklyAddOnQuantities}
              onQuantityChange={updateWeeklyAddOnQuantity}
              everyDayCaption
            />

            <div className="mt-8 rounded-2xl border border-stone-200 bg-white p-4">
              <OrderTotalBar
                summary={
                  weeklyDeliveryDayCount > 0
                    ? weeklyCustomizing
                      ? `${weeklyDeliveryDayCount} deliveries this week`
                      : `${formatWeekRangeLabel(weekMonday)} · ${weeklyRepresentativeBoxes.find((b) => b.id === weeklyBoxId)?.name ?? ""}`
                    : "Choose a box to continue"
                }
                breakdown={
                  weeklyUniformPrice != null
                    ? `${weeklyDeliveryDayCount} days × ${formatINR(weeklyUniformPrice)}`
                    : undefined
                }
                total={weeklyTotal}
                onContinue={handleContinue}
                validationMessage={
                  showValidation && weeklyDeliveryDayCount === 0 ? "Choose a box to continue." : null
                }
              />
            </div>
          </>
        )}

        {screen === "monthly-month" && (
          <>
            <StepHeader planLabel="Monthly" title="Choose your month" onBack={goBack} />
            <div className="flex flex-col gap-2">
              {monthOptionsWithCounts.map((opt) => (
                <button
                  key={`${opt.year}-${opt.month}`}
                  type="button"
                  onClick={() => selectMonth(opt)}
                  disabled={opt.eligibleCount === 0}
                  className="flex items-center justify-between rounded-2xl border border-stone-200 bg-white px-4 py-3.5 text-left transition-colors hover:border-brand/50 hover:bg-brand-light/40 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="text-sm font-medium text-foreground">{opt.label}</span>
                  <span className="text-xs text-foreground/50">
                    {opt.eligibleCount} delivery day{opt.eligibleCount === 1 ? "" : "s"}
                    {opt.eligibleCount === 0 ? " remaining" : ""}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        {screen === "monthly-configure" && monthSelection && (
          <>
            <StepHeader
              planLabel="Monthly"
              title={monthlyCustomizing ? "Customize dates" : "Choose your box"}
              onBack={goBack}
            />
            <p className="-mt-3 mb-4 text-sm text-foreground/60">
              {monthSelection.label} &middot; {monthlyEligibleDates.length} delivery day
              {monthlyEligibleDates.length === 1 ? "" : "s"}
            </p>

            {!monthlyHasMenu ? (
              <EmptyMenuState label={monthSelection.label} />
            ) : monthlyCustomizing ? (
              <MonthlyDateCustomizer
                dates={monthlyEligibleDates}
                skippedDates={monthlySkippedDates}
                onToggle={toggleMonthlySkip}
              />
            ) : (
              <>
                <div className="flex flex-col gap-3">
                  {monthlyRepresentativeBoxes.map((box) => (
                    <PlanBoxOption
                      key={box.id}
                      box={box}
                      selected={monthlyBoxId === box.id}
                      onSelect={() => toggleMonthlyBox(box.id)}
                      priceSuffix="/day"
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setMonthlyCustomizing(true)}
                  className="mt-4 text-sm font-medium text-brand-dark underline underline-offset-2"
                >
                  Need to skip some days? Customize dates →
                </button>
              </>
            )}

            {monthlyCustomizing && (
              <button
                type="button"
                onClick={() => setMonthlyCustomizing(false)}
                className="mt-4 text-sm font-medium text-brand-dark underline underline-offset-2"
              >
                ← Back to box selection
              </button>
            )}

            {!monthlyCustomizing && (
              <AddOnsSection
                addOns={monthlyAddOns}
                quantities={monthlyAddOnQuantities}
                onQuantityChange={updateMonthlyAddOnQuantity}
                everyDayCaption
              />
            )}

            <div className="mt-8 rounded-2xl border border-stone-200 bg-white p-4">
              <OrderTotalBar
                summary={
                  monthlyDeliveryDayCount > 0
                    ? `${monthlyDeliveryDayCount} delivery days in ${monthSelection.label}`
                    : "Choose a box to continue"
                }
                breakdown={
                  monthlyUniformPrice != null
                    ? `${monthlyDeliveryDayCount} days × ${formatINR(monthlyUniformPrice)}`
                    : undefined
                }
                total={monthlyTotal}
                onContinue={handleContinue}
                validationMessage={
                  showValidation && monthlyDeliveryDayCount === 0 ? "Choose a box to continue." : null
                }
              />
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function EmptyMenuState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-stone-200 bg-white px-4 py-8 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-stone-100 text-stone-300">
        <LeafIcon className="h-5 w-5" />
      </span>
      <p className="text-sm font-medium text-foreground">Menu to be updated</p>
      <p className="text-xs text-foreground/50">{label}&apos;s menu isn&apos;t available yet.</p>
    </div>
  );
}
