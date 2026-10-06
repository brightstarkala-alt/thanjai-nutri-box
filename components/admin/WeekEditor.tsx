"use client";

import { useState } from "react";
import { Save } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { adminApi, AdminError, type AdminWeek } from "@/lib/supabase/admin";
import { btn, Card, Field, input, Notice, Toggle } from "@/components/admin/ui";

type BoxForm = { box_type_id: string; box_name: string; name: string; description: string; contents: string; price: string; is_available: boolean };
type AddonForm = { addon_id: string; addon_name: string; price: string; is_available: boolean };

/**
 * Box contents are stored either as a list (["3 fruits", "2 vegetables"])
 * or, in some older weeks, as an object ({"fruits": 3, "breakfast": true}).
 * Shown one item per line either way; saving writes the list form.
 */
export function contentsToLines(contents: unknown): string {
  if (Array.isArray(contents)) return contents.map(String).join("\n");
  if (contents && typeof contents === "object") {
    return Object.entries(contents as Record<string, unknown>)
      .map(([key, value]) => {
        if (value === true) return key.charAt(0).toUpperCase() + key.slice(1);
        if (value === false || value == null) return null;
        if (typeof value === "number") return `${value} ${key}`;
        return `${key}: ${String(value)}`;
      })
      .filter(Boolean)
      .join("\n");
  }
  return typeof contents === "string" ? contents : "";
}

function toForm(week: AdminWeek) {
  return {
    notes: week.week.notes ?? "",
    boxes: week.boxes.map<BoxForm>((b) => ({
      box_type_id: b.box_type_id,
      box_name: b.box_name,
      name: b.config?.name ?? "",
      description: b.config?.description ?? "",
      contents: contentsToLines(b.config?.contents),
      price: b.config?.price != null ? String(Number(b.config.price)) : "",
      is_available: b.config?.is_available ?? false,
    })),
    addons: week.addons.map<AddonForm>((a) => ({
      addon_id: a.addon_id,
      addon_name: a.addon_name,
      price: a.config?.price != null ? String(Number(a.config.price)) : "",
      is_available: a.config?.is_available ?? false,
    })),
  };
}

export const contentsFromText = (text: string) =>
  text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

const priceOrNull = (s: string) => (s.trim() === "" ? null : Number(s));

// The week's default menu: Box 1, Box 2, Juice, Koozh.
export function WeekEditor({ week, onSaved }: { week: AdminWeek; onSaved: (w: AdminWeek) => void }) {
  const [form, setForm] = useState(() => toForm(week));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const setBox = (i: number, patch: Partial<BoxForm>) =>
    setForm((f) => ({ ...f, boxes: f.boxes.map((b, j) => (j === i ? { ...b, ...patch } : b)) }));
  const setAddon = (i: number, patch: Partial<AddonForm>) =>
    setForm((f) => ({ ...f, addons: f.addons.map((a, j) => (j === i ? { ...a, ...patch } : a)) }));

  async function save() {
    for (const b of form.boxes) {
      const p = priceOrNull(b.price);
      if (p != null && (!Number.isFinite(p) || p < 0)) return setMsg({ tone: "error", text: `${b.box_name}: enter a valid price.` });
      if (b.is_available && p == null) return setMsg({ tone: "error", text: `${b.box_name} is available, so it needs a price.` });
    }
    for (const a of form.addons) {
      const p = priceOrNull(a.price);
      if (p == null || !Number.isFinite(p) || p < 0) return setMsg({ tone: "error", text: `${a.addon_name}: enter a price (0 or more).` });
    }
    setBusy(true);
    setMsg(null);
    try {
      const saved = await adminApi.saveWeek(createClient(), week.week.id, {
        notes: form.notes,
        boxes: form.boxes.map((b) => ({
          box_type_id: b.box_type_id,
          name: b.name,
          description: b.description,
          contents: contentsFromText(b.contents),
          price: priceOrNull(b.price),
          is_available: b.is_available,
        })),
        addons: form.addons.map((a) => ({ addon_id: a.addon_id, price: priceOrNull(a.price), is_available: a.is_available })),
      });
      onSaved(saved);
      setMsg({ tone: "ok", text: "Weekly menu saved." });
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof AdminError ? e.message : "Couldn't save." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        {form.boxes.map((b, i) => (
          <Card key={b.box_type_id}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-serif text-lg font-semibold text-ink">{b.box_name}</h3>
              <Toggle checked={b.is_available} onChange={(v) => setBox(i, { is_available: v })} label={`${b.box_name} available`} />
            </div>
            <div className="mt-3 space-y-3">
              <Field label="Name" hint="Shown in the admin; customers currently see “Box 1” / “Box 2”.">
                <input value={b.name} onChange={(e) => setBox(i, { name: e.target.value })} className={input} aria-label={`${b.box_name} name`} />
              </Field>
              <Field label="Description" hint="Customers see this under the box.">
                <input value={b.description} onChange={(e) => setBox(i, { description: e.target.value })} className={input} aria-label={`${b.box_name} description`} />
              </Field>
              <Field label="Contents" hint="One item per line.">
                <textarea rows={3} value={b.contents} onChange={(e) => setBox(i, { contents: e.target.value })} className={input} aria-label={`${b.box_name} contents`} />
              </Field>
              <Field label="Price (₹ per box)">
                <input inputMode="decimal" value={b.price} onChange={(e) => setBox(i, { price: e.target.value })} className={input} aria-label={`${b.box_name} price`} />
              </Field>
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <h3 className="font-serif text-lg font-semibold text-ink">Add-ons</h3>
        <div className="mt-3 divide-y divide-line-soft">
          {form.addons.map((a, i) => (
            <div key={a.addon_id} className="flex flex-wrap items-center gap-3 py-3">
              <span className="w-20 font-semibold text-ink">{a.addon_name}</span>
              <label className="flex items-center gap-2 text-sm text-ink-soft">
                ₹
                <input inputMode="decimal" value={a.price} onChange={(e) => setAddon(i, { price: e.target.value })} className={`${input} w-24`} aria-label={`${a.addon_name} price`} />
              </label>
              <Toggle checked={a.is_available} onChange={(v) => setAddon(i, { is_available: v })} label={`${a.addon_name} available`} />
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <Field label="Week notes (admin only)">
          <input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className={input} aria-label="Week notes" />
        </Field>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={busy} className={btn.primary}>
          <Save className="size-4" /> {busy ? "Saving…" : "Save weekly menu"}
        </button>
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      </div>
    </div>
  );
}
