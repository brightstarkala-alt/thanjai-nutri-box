"use client";

import { useState } from "react";
import { SiteHeader } from "@/components/shared/SiteHeader";
import { SiteFooter } from "@/components/shared/SiteFooter";
import { BoxCard } from "@/components/shared/BoxCard";
import { DateChipInput } from "@/components/shared/DateChipInput";
import { Button } from "@/components/ui/Button";
import { useMenu } from "@/components/providers/MenuProvider";
import { BOX_IDENTITIES, DEFAULT_BOX_MENUS } from "@/lib/sample-data/boxes";
import { formatDeliveryDate, isSunday } from "@/lib/business-logic/delivery-date";
import type { BoxId, BoxMenuEntry } from "@/lib/types";

type Scope = "default" | "dates";

export default function AdminBoxesPage() {
  // Real, read-only Supabase data — used only for the "Preview What
  // Customers Will See" panel below, so admins can see the actual live
  // menu. The edit form above it is a local-only sandbox (see banner) —
  // it cannot write to Supabase yet, since that requires admin
  // authentication and a week-based publish workflow, neither of which
  // exist yet. Wiring this form up to real writes is future work, out of
  // scope for the menu-data-read integration this page was last touched
  // for.
  const {
    getBoxDisplay: getRealBoxDisplay,
    loading: previewLoading,
    error: previewError,
  } = useMenu();

  // --- Local sandbox state (NOT Supabase — see banner) ---
  const [defaultMenus, setDefaultMenus] =
    useState<Record<BoxId, BoxMenuEntry>>(DEFAULT_BOX_MENUS);
  const [overrides, setOverrides] = useState<BoxMenuEntry[]>([]);

  type MenuContentUpdate = {
    description: string;
    price: number | null;
    imageUrl?: string;
    available: boolean;
  };

  function setDefaultMenu(boxId: BoxId, update: MenuContentUpdate) {
    setDefaultMenus((prev) => ({ ...prev, [boxId]: { boxId, date: null, ...update } }));
  }

  function saveDateMenu(boxId: BoxId, dates: string[], update: MenuContentUpdate) {
    setOverrides((prev) => {
      const next = [...prev];
      for (const date of dates) {
        const idx = next.findIndex((o) => o.boxId === boxId && o.date === date);
        const entry: BoxMenuEntry = { boxId, date, ...update };
        if (idx >= 0) next[idx] = entry;
        else next.push(entry);
      }
      return next;
    });
  }

  function deleteDateMenu(boxId: BoxId, date: string) {
    setOverrides((prev) => prev.filter((o) => !(o.boxId === boxId && o.date === date)));
  }

  function copyMenuToDates(boxId: BoxId, sourceDate: string | null, targetDates: string[]) {
    setOverrides((prev) => {
      const source =
        (sourceDate !== null && prev.find((o) => o.boxId === boxId && o.date === sourceDate)) ||
        defaultMenus[boxId];
      const next = [...prev];
      for (const date of targetDates) {
        const idx = next.findIndex((o) => o.boxId === boxId && o.date === date);
        const entry: BoxMenuEntry = {
          boxId,
          date,
          description: source.description,
          price: source.price,
          imageUrl: source.imageUrl,
          available: source.available,
        };
        if (idx >= 0) next[idx] = entry;
        else next.push(entry);
      }
      return next;
    });
  }

  const [selectedBoxId, setSelectedBoxId] = useState<BoxId>("box-1");

  // --- Edit form state ---
  const [scope, setScope] = useState<Scope>("default");
  const [dateChips, setDateChips] = useState<string[]>([]);
  const [pendingDate, setPendingDate] = useState("");
  const [description, setDescription] = useState(
    defaultMenus["box-1"].description
  );
  const [price, setPrice] = useState(
    defaultMenus["box-1"].price != null
      ? String(defaultMenus["box-1"].price)
      : ""
  );
  const [imageUrl, setImageUrl] = useState(defaultMenus["box-1"].imageUrl ?? "");
  const [available, setAvailable] = useState(defaultMenus["box-1"].available);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // --- Copy-to-dates tool state ---
  const [copySource, setCopySource] = useState<string>("default");
  const [copyTargets, setCopyTargets] = useState<string[]>([]);
  const [copyPendingDate, setCopyPendingDate] = useState("");
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

  // --- Preview state ---
  const [previewDate, setPreviewDate] = useState("");

  function loadFormFromEntry(entry: BoxMenuEntry, nextScope: Scope, dates: string[]) {
    setScope(nextScope);
    setDateChips(dates);
    setPendingDate("");
    setDescription(entry.description);
    setPrice(entry.price != null ? String(entry.price) : "");
    setImageUrl(entry.imageUrl ?? "");
    setAvailable(entry.available);
    setFormError(null);
    setSuccessMessage(null);
  }

  function handleSelectBox(boxId: BoxId) {
    setSelectedBoxId(boxId);
    loadFormFromEntry(defaultMenus[boxId], "default", []);
    setCopySource("default");
    setCopyTargets([]);
    setCopyPendingDate("");
    setCopyMessage(null);
  }

  function handleNewDateEntry() {
    loadFormFromEntry(
      { boxId: selectedBoxId, date: null, description: "", price: null, available: true },
      "dates",
      []
    );
  }

  function handleEditEntry(entry: BoxMenuEntry) {
    loadFormFromEntry(entry, "dates", entry.date ? [entry.date] : []);
  }

  function handleAddDateChip() {
    if (!pendingDate) return;
    if (isSunday(pendingDate)) {
      setFormError(
        "Sunday is always unavailable to customers, so it can't be used here."
      );
      setPendingDate("");
      return;
    }
    if (!dateChips.includes(pendingDate)) {
      setDateChips((prev) => [...prev, pendingDate].sort());
    }
    setFormError(null);
    setPendingDate("");
  }

  function handleSave() {
    if (!description.trim()) {
      setFormError("Description is required.");
      return;
    }
    const parsedPrice = price.trim() === "" ? null : Number(price);
    if (price.trim() !== "" && (Number.isNaN(parsedPrice) || (parsedPrice as number) < 0)) {
      setFormError("Price must be a positive number, or leave it blank.");
      return;
    }
    if (scope === "dates" && dateChips.length === 0) {
      setFormError("Add at least one date to apply this menu to.");
      return;
    }

    const update = {
      description: description.trim(),
      price: parsedPrice,
      imageUrl: imageUrl.trim() || undefined,
      available,
    };

    if (scope === "default") {
      setDefaultMenu(selectedBoxId, update);
      setSuccessMessage("Default menu updated.");
    } else {
      saveDateMenu(selectedBoxId, dateChips, update);
      setSuccessMessage(
        `Menu saved for ${dateChips.length} date${dateChips.length > 1 ? "s" : ""}.`
      );
    }
    setFormError(null);
  }

  const boxOverrides = overrides
    .filter((o) => o.boxId === selectedBoxId)
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));

  function handleAddCopyTarget() {
    if (!copyPendingDate) return;
    if (isSunday(copyPendingDate)) {
      setCopyMessage(
        "Sunday is always unavailable to customers, so it can't be used here."
      );
      setCopyPendingDate("");
      return;
    }
    if (!copyTargets.includes(copyPendingDate)) {
      setCopyTargets((prev) => [...prev, copyPendingDate].sort());
    }
    setCopyMessage(null);
    setCopyPendingDate("");
  }

  function handleCopy() {
    if (copyTargets.length === 0) {
      setCopyMessage("Add at least one target date.");
      return;
    }
    copyMenuToDates(
      selectedBoxId,
      copySource === "default" ? null : copySource,
      copyTargets
    );
    setCopyMessage(
      `Copied to ${copyTargets.length} date${copyTargets.length > 1 ? "s" : ""}.`
    );
    setCopyTargets([]);
  }

  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        <h1 className="text-2xl font-bold text-brand-dark sm:text-3xl">
          Box Menu Management
        </h1>
        <p className="mt-2 rounded-lg border border-brand/20 bg-brand-light px-4 py-2 text-sm text-brand-dark">
          The editor below is a local sandbox for trying out the
          menu-editing UI — it is <strong>not</strong> connected to Supabase
          and changes here do not affect what customers see. Real editing
          requires admin authentication and a week-based publish workflow,
          neither built yet. The preview panel on the right, however, shows
          the actual live menu from Supabase.
        </p>

        {/* Box selector */}
        <div className="mt-6 flex gap-2">
          {BOX_IDENTITIES.map((identity) => (
            <button
              key={identity.id}
              type="button"
              onClick={() => handleSelectBox(identity.id)}
              className={`min-h-11 rounded-lg px-4 text-sm font-semibold ${
                selectedBoxId === identity.id
                  ? "bg-brand text-brand-contrast"
                  : "border border-brand/30 text-brand-dark"
              }`}
            >
              {identity.name}
            </button>
          ))}
        </div>

        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-2">
          {/* Edit form */}
          <section>
            <h2 className="text-lg font-semibold text-brand-dark">
              Edit Menu
            </h2>

            <div className="mt-3 flex gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={scope === "default"}
                  onChange={() => setScope("default")}
                />
                Default (all dates without a specific menu)
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={scope === "dates"}
                  onChange={() => setScope("dates")}
                />
                Specific date(s)
              </label>
            </div>

            {scope === "dates" && (
              <div className="mt-3">
                <DateChipInput
                  dates={dateChips}
                  pendingDate={pendingDate}
                  onPendingDateChange={setPendingDate}
                  onAdd={handleAddDateChip}
                  onRemove={(d) => setDateChips((prev) => prev.filter((x) => x !== d))}
                  label="Date to apply this menu to"
                />
              </div>
            )}

            <label className="mt-4 block text-sm font-medium text-foreground/80">
              Description
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Describe what's in this box"
                className="mt-1 w-full rounded-lg border border-brand/30 px-3 py-2 text-base focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
              />
            </label>

            <label className="mt-4 block text-sm font-medium text-foreground/80">
              Price (INR)
              <input
                type="number"
                min={0}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="Leave blank if not set yet"
                className="mt-1 w-full min-h-11 rounded-lg border border-brand/30 px-3 py-2 text-base focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
              />
            </label>

            <label className="mt-4 block text-sm font-medium text-foreground/80">
              Image URL (optional)
              <input
                type="text"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://..."
                className="mt-1 w-full min-h-11 rounded-lg border border-brand/30 px-3 py-2 text-base focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
              />
            </label>

            <label className="mt-4 flex items-center gap-2 text-sm font-medium text-foreground/80">
              <input
                type="checkbox"
                checked={available}
                onChange={(e) => setAvailable(e.target.checked)}
              />
              Available for ordering
            </label>

            {formError && (
              <p className="mt-3 text-sm font-medium text-red-600">{formError}</p>
            )}
            {successMessage && !formError && (
              <p className="mt-3 text-sm font-medium text-brand-dark">
                {successMessage}
              </p>
            )}

            <div className="mt-4 flex gap-3">
              <Button onClick={handleSave}>Save</Button>
              <Button variant="secondary" onClick={handleNewDateEntry}>
                New date-specific entry
              </Button>
            </div>

            {/* Existing date-specific menus */}
            <h3 className="mt-8 text-base font-semibold text-brand-dark">
              Date-Specific Menus for {BOX_IDENTITIES.find((b) => b.id === selectedBoxId)?.name}
            </h3>
            {boxOverrides.length === 0 ? (
              <p className="mt-2 text-sm text-foreground/60">
                No date-specific menus yet — this box uses the default menu
                for every date.
              </p>
            ) : (
              <ul className="mt-2 flex flex-col gap-2">
                {boxOverrides.map((entry) => (
                  <li
                    key={entry.date}
                    className="flex items-center justify-between gap-3 rounded-lg border border-brand/15 bg-white p-3 text-sm"
                  >
                    <div>
                      <p className="font-medium text-brand-dark">
                        {formatDeliveryDate(entry.date as string)}
                      </p>
                      <p className="text-foreground/70">
                        {entry.description || "(no description)"}
                        {entry.price != null ? ` — ₹${entry.price}` : " — price not set"}
                        {!entry.available && " — unavailable"}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={() => handleEditEntry(entry)}
                        className="text-sm font-medium text-brand-dark underline"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteDateMenu(selectedBoxId, entry.date as string)}
                        className="text-sm font-medium text-red-600 underline"
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {/* Copy menu to other dates */}
            <h3 className="mt-8 text-base font-semibold text-brand-dark">
              Copy Menu to Other Dates
            </h3>
            <label className="mt-2 block text-sm font-medium text-foreground/80">
              Copy from
              <select
                value={copySource}
                onChange={(e) => setCopySource(e.target.value)}
                className="mt-1 w-full min-h-11 rounded-lg border border-brand/30 px-3 py-2 text-base"
              >
                <option value="default">Default menu</option>
                {boxOverrides.map((entry) => (
                  <option key={entry.date} value={entry.date as string}>
                    {formatDeliveryDate(entry.date as string)}
                  </option>
                ))}
              </select>
            </label>
            <div className="mt-3">
              <DateChipInput
                dates={copyTargets}
                pendingDate={copyPendingDate}
                onPendingDateChange={setCopyPendingDate}
                onAdd={handleAddCopyTarget}
                onRemove={(d) => setCopyTargets((prev) => prev.filter((x) => x !== d))}
                label="Target date to copy the menu to"
              />
            </div>
            {copyMessage && (
              <p className="mt-2 text-sm font-medium text-brand-dark">{copyMessage}</p>
            )}
            <Button variant="secondary" className="mt-3" onClick={handleCopy}>
              Copy
            </Button>
          </section>

          {/* Preview — reads REAL Supabase data, not the sandbox above */}
          <section>
            <h2 className="text-lg font-semibold text-brand-dark">
              Preview What Customers Will See
            </h2>
            <p className="mt-1 text-xs text-foreground/60">
              This reflects the actual live menu in Supabase, not the
              sandbox editor on the left.
            </p>
            <label htmlFor="preview-date" className="mt-2 block text-sm font-medium text-foreground/80">
              Delivery date
              <input
                id="preview-date"
                type="date"
                value={previewDate}
                onChange={(e) => setPreviewDate(e.target.value)}
                className="mt-1 min-h-11 rounded-lg border border-brand/30 px-3 py-2 text-base"
              />
            </label>

            {previewLoading ? (
              <p className="mt-4 text-sm text-foreground/60">Loading live menu data…</p>
            ) : previewError ? (
              <p className="mt-4 text-sm font-medium text-red-600">
                Couldn&apos;t load live menu data: {previewError}
              </p>
            ) : !previewDate ? (
              <p className="mt-4 text-sm text-foreground/60">
                Pick a date to preview the boxes as a customer would see them.
              </p>
            ) : (
              <div className="mt-4 flex flex-col gap-4">
                {BOX_IDENTITIES.map((identity) => (
                  <BoxCard
                    key={identity.id}
                    box={getRealBoxDisplay(identity.id, previewDate)}
                    readOnly
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
