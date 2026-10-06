"use client";

import { useState } from "react";
import { Save } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { adminApi, AdminError, type AdminWeek, type AdminWeekDate } from "@/lib/supabase/admin";
import { btn, Field, input, Notice, Toggle } from "@/components/admin/ui";
import { contentsFromText, contentsToLines } from "@/components/admin/WeekEditor";

type BoxOverride = { box_type_id: string; box_name: string; enabled: boolean; name: string; description: string; contents: string; price: string; is_available: boolean };
type AddonOverride = { addon_id: string; addon_name: string; enabled: boolean; price: string; is_available: boolean };

const priceOrNull = (s: string) => (s.trim() === "" ? null : Number(s));
const str = (n: number | null | undefined) => (n != null ? String(Number(n)) : "");

// One delivery date: open/closed, holiday reason, cutoff time, and optional
// date-specific settings that replace the week's default for that date only.
export function DateEditor({ week, day, onSaved, onClose }: { week: AdminWeek; day: AdminWeekDate; onSaved: (w: AdminWeek) => void; onClose: () => void }) {
  const [available, setAvailable] = useState(day.menu_date?.is_service_available ?? true);
  const [reason, setReason] = useState(day.menu_date?.holiday_reason ?? "");
  const [cutoff, setCutoff] = useState(day.menu_date?.cutoff_time?.slice(0, 5) ?? "");
  const [boxes, setBoxes] = useState<BoxOverride[]>(() =>
    week.boxes.map((b) => {
      const o = day.box_overrides.find((x) => x.box_type_id === b.box_type_id);
      const src = o ?? b.config; // start from the weekly setting when adding an override
      return {
        box_type_id: b.box_type_id,
        box_name: b.box_name,
        enabled: !!o,
        name: src?.name ?? "",
        description: src?.description ?? "",
        contents: contentsToLines(src?.contents),
        price: str(src?.price),
        is_available: src?.is_available ?? true,
      };
    })
  );
  const [addons, setAddons] = useState<AddonOverride[]>(() =>
    week.addons.map((a) => {
      const o = day.addon_overrides.find((x) => x.addon_id === a.addon_id);
      const src = o ?? a.config;
      return { addon_id: a.addon_id, addon_name: a.addon_name, enabled: !!o, price: str(src?.price), is_available: src?.is_available ?? true };
    })
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const setBox = (i: number, p: Partial<BoxOverride>) => setBoxes((list) => list.map((b, j) => (j === i ? { ...b, ...p } : b)));
  const setAddon = (i: number, p: Partial<AddonOverride>) => setAddons((list) => list.map((a, j) => (j === i ? { ...a, ...p } : a)));

  async function save() {
    for (const b of boxes.filter((x) => x.enabled)) {
      const p = priceOrNull(b.price);
      if (p != null && (!Number.isFinite(p) || p < 0)) return setMsg({ tone: "error", text: `${b.box_name}: enter a valid price.` });
      if (b.is_available && p == null) return setMsg({ tone: "error", text: `${b.box_name} is available on this date, so it needs a price.` });
    }
    for (const a of addons.filter((x) => x.enabled)) {
      const p = priceOrNull(a.price);
      if (p == null || !Number.isFinite(p) || p < 0) return setMsg({ tone: "error", text: `${a.addon_name}: enter a price (0 or more).` });
    }
    setBusy(true);
    setMsg(null);
    try {
      const saved = await adminApi.saveDate(createClient(), week.week.id, day.date, {
        is_service_available: available,
        holiday_reason: available ? "" : reason,
        cutoff_time: cutoff || null,
        box_overrides: boxes.map((b) => ({
          box_type_id: b.box_type_id,
          enabled: b.enabled,
          name: b.name,
          description: b.description,
          contents: contentsFromText(b.contents),
          price: priceOrNull(b.price),
          is_available: b.is_available,
        })),
        addon_overrides: addons.map((a) => ({ addon_id: a.addon_id, enabled: a.enabled, price: priceOrNull(a.price), is_available: a.is_available })),
      });
      onSaved(saved);
      setMsg({ tone: "ok", text: "Date saved." });
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof AdminError ? e.message : "Couldn't save this date." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 border-t border-line-soft pt-4" data-date-editor={day.date}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-semibold text-ink">Delivery on this date</span>
        <Toggle checked={available} onChange={setAvailable} label="Delivery available on this date" />
      </div>
      {!available && (
        <Field label="Reason (shown to admins)">
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Pongal holiday" className={input} aria-label="Holiday reason" />
        </Field>
      )}
      <Field label="Order cutoff (optional)" hint={`Orders for this date close at this time on the previous day. Default: ${week.settings.default_cutoff_time.slice(0, 5)}.`}>
        <input type="time" value={cutoff} onChange={(e) => setCutoff(e.target.value)} className={`${input} w-36`} aria-label="Cutoff time" />
      </Field>
      {day.order_count > 0 && (
        <Notice tone="info">
          {day.order_count} order{day.order_count === 1 ? " is" : "s are"} already booked for this date. Changes don&apos;t affect them — only new orders.
        </Notice>
      )}

      <div>
        <h4 className="text-sm font-semibold text-ink">Date-specific menu (optional)</h4>
        <p className="text-xs text-ink-soft">Tick an item to give it a different setting on this date only. Untick to use the weekly menu again.</p>
        <div className="mt-3 space-y-3">
          {boxes.map((b, i) => (
            <div key={b.box_type_id} className="rounded-xl bg-surface-strong p-3 ring-1 ring-line-soft">
              <label className="flex items-center gap-2 text-sm font-semibold text-ink">
                <input type="checkbox" checked={b.enabled} onChange={(e) => setBox(i, { enabled: e.target.checked })} className="size-4 accent-[var(--leaf)]" aria-label={`Override ${b.box_name} on this date`} />
                Different {b.box_name} on this date
              </label>
              {b.enabled && (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Field label="Name"><input value={b.name} onChange={(e) => setBox(i, { name: e.target.value })} className={input} aria-label={`${b.box_name} name on this date`} /></Field>
                  <Field label="Price (₹)"><input inputMode="decimal" value={b.price} onChange={(e) => setBox(i, { price: e.target.value })} className={input} aria-label={`${b.box_name} price on this date`} /></Field>
                  <Field label="Description"><input value={b.description} onChange={(e) => setBox(i, { description: e.target.value })} className={input} aria-label={`${b.box_name} description on this date`} /></Field>
                  <Field label="Contents (one per line)"><textarea rows={2} value={b.contents} onChange={(e) => setBox(i, { contents: e.target.value })} className={input} aria-label={`${b.box_name} contents on this date`} /></Field>
                  <div><Toggle checked={b.is_available} onChange={(v) => setBox(i, { is_available: v })} label={`${b.box_name} available on this date`} /></div>
                </div>
              )}
            </div>
          ))}
          {addons.map((a, i) => (
            <div key={a.addon_id} className="rounded-xl bg-surface-strong p-3 ring-1 ring-line-soft">
              <label className="flex items-center gap-2 text-sm font-semibold text-ink">
                <input type="checkbox" checked={a.enabled} onChange={(e) => setAddon(i, { enabled: e.target.checked })} className="size-4 accent-[var(--leaf)]" aria-label={`Override ${a.addon_name} on this date`} />
                Different {a.addon_name} on this date
              </label>
              {a.enabled && (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 text-sm text-ink-soft">
                    ₹<input inputMode="decimal" value={a.price} onChange={(e) => setAddon(i, { price: e.target.value })} className={`${input} w-24`} aria-label={`${a.addon_name} price on this date`} />
                  </label>
                  <Toggle checked={a.is_available} onChange={(v) => setAddon(i, { is_available: v })} label={`${a.addon_name} available on this date`} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={save} disabled={busy} className={btn.primary}>
          <Save className="size-4" /> {busy ? "Saving…" : "Save date"}
        </button>
        <button type="button" onClick={onClose} className={btn.secondary}>
          Close
        </button>
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      </div>
    </div>
  );
}
