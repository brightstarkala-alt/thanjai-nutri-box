"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Copy, Plus, Send, XCircle, Lock, PencilLine } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  adminApi,
  AdminError,
  formatDayIST,
  todayIST,
  type AdminWeek,
  type AdminWeekDate,
  type AdminWeekSummary,
  type WeekStatus,
} from "@/lib/supabase/admin";
import { btn, Card, Field, input, Loading, Notice, PageTitle, WeekBadge } from "@/components/admin/ui";
import { WeekEditor } from "@/components/admin/WeekEditor";
import { DateEditor } from "@/components/admin/DateEditor";

const weekLabel = (w: { week_start_date: string; week_end_date: string }) =>
  `${formatDayIST(w.week_start_date)} – ${formatDayIST(w.week_end_date)} ${w.week_start_date.slice(0, 4)}`;

function addDays(date: string, n: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function nextMonday(from: string) {
  const d = new Date(`${from}T00:00:00Z`);
  const add = (8 - d.getUTCDay()) % 7 || 7;
  return addDays(from, add);
}

function dateStatus(day: AdminWeekDate, sundayHoliday: boolean): { label: string; open: boolean } {
  if (day.is_sunday && sundayHoliday) return { label: "Sunday holiday", open: false };
  if (day.business_holiday) return { label: `Holiday · ${day.business_holiday}`, open: false };
  if (day.menu_date && !day.menu_date.is_service_available) return { label: `Unavailable${day.menu_date.holiday_reason ? ` · ${day.menu_date.holiday_reason}` : ""}`, open: false };
  return { label: "Available", open: true };
}

export default function AdminMenuPage() {
  const [weeks, setWeeks] = useState<AdminWeekSummary[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [week, setWeek] = useState<AdminWeek | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newStart, setNewStart] = useState("");
  const [copyFrom, setCopyFrom] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [openDate, setOpenDate] = useState<string | null>(null);

  // Loads the week list and selects `select`, else this week, else the next.
  const loadWeeks = useCallback((select?: string) => {
    return adminApi
      .listWeeks(createClient())
      .then((list) => {
        setWeeks(list);
        const today = todayIST();
        const current = list.find((w) => w.week_start_date <= today && today <= addDays(w.week_start_date, 6));
        const upcoming = [...list].reverse().find((w) => w.week_start_date > today);
        setSelectedId(select ?? current?.id ?? upcoming?.id ?? list[0]?.id ?? null);
      })
      .catch((e) => setError(e instanceof AdminError ? e.message : "Couldn't load menu weeks."));
  }, []);

  useEffect(() => {
    void loadWeeks();
  }, [loadWeeks]);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    adminApi
      .getWeek(createClient(), selectedId)
      .then((w) => !cancelled && setWeek(w))
      .catch((e) => !cancelled && setError(e instanceof AdminError ? e.message : "Couldn't load this week."));
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  function selectWeek(id: string) {
    setWeek(null);
    setOpenDate(null);
    setMsg(null);
    setSelectedId(id);
  }

  function onWeekSaved(w: AdminWeek) {
    setWeek(w);
    setWeeks((list) => list?.map((x) => (x.id === w.week.id ? { ...x, status: w.week.status, notes: w.week.notes } : x)) ?? null);
  }

  function startCreate(copy: boolean) {
    const latest = weeks?.[0];
    setNewStart(latest ? addDays(latest.week_start_date, 7) : nextMonday(todayIST()));
    setCopyFrom(copy && latest ? latest.id : "");
    setCreating(true);
    setMsg(null);
  }

  async function create() {
    setBusy(true);
    setMsg(null);
    try {
      const id = await adminApi.createWeek(createClient(), newStart, copyFrom || null);
      setCreating(false);
      setWeek(null);
      setOpenDate(null);
      await loadWeeks(id);
      setMsg({ tone: "ok", text: copyFrom ? "Week created as a draft, copied from the selected week." : "Week created as a draft." });
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof AdminError ? e.message : "Couldn't create the week." });
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(status: WeekStatus) {
    if (!week) return;
    setBusy(true);
    setMsg(null);
    try {
      onWeekSaved(await adminApi.setWeekStatus(createClient(), week.week.id, status));
      setMsg({ tone: "ok", text: status === "published" ? "Published — customers can now order this week." : status === "closed" ? "Closed — no new orders for this week." : "Moved back to draft — hidden from customers." });
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof AdminError ? e.message : "Couldn't change the status." });
    } finally {
      setBusy(false);
    }
  }

  if (error) return <Notice tone="error">{error}</Notice>;
  if (!weeks) return <Loading />;

  const blocking = week?.checks.filter((c) => c.blocking && !c.ok) ?? [];

  return (
    <div className="space-y-5">
      <PageTitle
        title="Menu"
        subtitle="Weekly menus, delivery dates and date-specific changes"
        actions={
          <>
            <button type="button" onClick={() => startCreate(true)} disabled={!weeks.length} className={btn.secondary}>
              <Copy className="size-4" /> Copy previous week
            </button>
            <button type="button" onClick={() => startCreate(false)} className={btn.primary}>
              <Plus className="size-4" /> New week
            </button>
          </>
        }
      />

      {creating && (
        <Card>
          <h2 className="font-semibold text-ink">Create a week</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Week starting (Monday)" hint="The week runs Monday to Saturday.">
              <input type="date" value={newStart} onChange={(e) => setNewStart(e.target.value)} className={input} aria-label="Week start date" />
            </Field>
            <Field label="Copy menu from">
              <select value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)} className={input} aria-label="Copy menu from">
                <option value="">Don&apos;t copy — start empty</option>
                {weeks.map((w) => (
                  <option key={w.id} value={w.id}>
                    {weekLabel(w)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={create} disabled={busy || !newStart} className={btn.primary}>
              Create draft week
            </button>
            <button type="button" onClick={() => setCreating(false)} className={btn.secondary}>
              Cancel
            </button>
          </div>
        </Card>
      )}

      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

      {weeks.length === 0 ? (
        <Notice tone="info">No menu weeks yet — create one to get started.</Notice>
      ) : (
        <Field label="Week">
          <select value={selectedId ?? ""} onChange={(e) => selectWeek(e.target.value)} className={input} aria-label="Select week">
            {weeks.map((w) => (
              <option key={w.id} value={w.id}>
                {weekLabel(w)} · {w.status}
                {w.order_count ? ` · ${w.order_count} order${w.order_count === 1 ? "" : "s"}` : ""}
              </option>
            ))}
          </select>
        </Field>
      )}

      {selectedId && !week ? (
        <Loading />
      ) : week ? (
        <>
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-serif text-xl font-semibold text-ink">{weekLabel(week.week)}</p>
                <div className="mt-1 flex items-center gap-2">
                  <WeekBadge status={week.week.status} />
                  <span className="text-xs text-ink-soft">
                    {week.week.status === "draft" ? "Hidden from customers" : week.week.status === "published" ? "Customers can order" : "No new orders"}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {week.week.status !== "published" && (
                  <button type="button" onClick={() => setStatus("published")} disabled={busy || blocking.length > 0} className={btn.primary}>
                    <Send className="size-4" /> Publish week
                  </button>
                )}
                {week.week.status === "published" && (
                  <button type="button" onClick={() => setStatus("closed")} disabled={busy} className={btn.secondary}>
                    <Lock className="size-4" /> Close week
                  </button>
                )}
                {week.week.status !== "draft" && (
                  <button type="button" onClick={() => setStatus("draft")} disabled={busy} className={btn.secondary}>
                    <PencilLine className="size-4" /> Move to draft
                  </button>
                )}
              </div>
            </div>
            <ul className="mt-4 grid gap-1.5 sm:grid-cols-2" aria-label="Publish checklist">
              {week.checks.map((c) => (
                <li key={c.label} className="flex items-start gap-2 text-sm">
                  {c.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-leaf" /> : <XCircle className={`mt-0.5 size-4 shrink-0 ${c.blocking ? "text-danger" : "text-amber-600"}`} />}
                  <span>
                    <span className="font-medium text-ink">{c.label}</span>
                    <span className="block text-xs text-ink-soft">{c.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
            {blocking.length > 0 && week.week.status !== "published" && (
              <p className="mt-3 text-sm font-medium text-danger">Fix the items marked in red before publishing.</p>
            )}
          </Card>

          <section>
            <h2 className="text-lg font-semibold text-ink">Weekly menu (default for every day)</h2>
            <div className="mt-3">
              <WeekEditor key={week.week.id} week={week} onSaved={onWeekSaved} />
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-ink">Delivery dates</h2>
            <p className="text-sm text-ink-soft">Open or close single days and give a day its own menu without changing the week.</p>
            <div className="mt-3 space-y-2">
              {week.dates.map((day) => {
                const s = dateStatus(day, week.settings.sunday_is_holiday);
                const editable = !(day.is_sunday && week.settings.sunday_is_holiday) && !day.is_sunday;
                const overrides = day.box_overrides.length + day.addon_overrides.length;
                return (
                  <Card key={day.date}>
                    <div className="flex flex-wrap items-center justify-between gap-2" data-date-row={day.date}>
                      <div className="min-w-0">
                        <p className="font-semibold text-ink">{formatDayIST(day.date, "long")}</p>
                        <p className="text-xs text-ink-soft">
                          <span className={s.open ? "font-semibold text-leaf-deep" : "font-semibold text-danger"}>{s.open ? "✓ " : ""}{s.label}</span>
                          {day.order_count > 0 && ` · ${day.order_count} order${day.order_count === 1 ? "" : "s"}`}
                          {overrides > 0 && ` · ${overrides} date-specific change${overrides === 1 ? "" : "s"}`}
                          {day.menu_date?.cutoff_time && ` · cutoff ${day.menu_date.cutoff_time.slice(0, 5)}`}
                        </p>
                      </div>
                      {editable && openDate !== day.date && (
                        <button type="button" onClick={() => setOpenDate(day.date)} className={btn.secondary} aria-label={`Edit ${day.date}`}>
                          Edit date
                        </button>
                      )}
                    </div>
                    {editable && openDate === day.date && (
                      <div className="mt-3">
                        <DateEditor week={week} day={day} onSaved={onWeekSaved} onClose={() => setOpenDate(null)} />
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
