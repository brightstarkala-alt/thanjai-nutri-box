import { formatDeliveryDate } from "@/lib/business-logic/delivery-date";

type DateChipInputProps = {
  dates: string[];
  pendingDate: string;
  onPendingDateChange: (date: string) => void;
  onAdd: () => void;
  onRemove: (date: string) => void;
  min?: string;
  label: string;
};

// Reusable multi-date picker: pick a date, add it as a removable chip.
// Used anywhere the admin needs to apply one change to several dates at
// once (menu scheduling, copy-to-dates, and future features like offers
// or no-service dates).
export function DateChipInput({
  dates,
  pendingDate,
  onPendingDateChange,
  onAdd,
  onRemove,
  min,
  label,
}: DateChipInputProps) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          min={min}
          value={pendingDate}
          onChange={(e) => onPendingDateChange(e.target.value)}
          aria-label={label}
          className="min-h-11 rounded-lg border border-brand/30 px-3 py-1.5 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
        />
        <button
          type="button"
          onClick={onAdd}
          disabled={!pendingDate}
          className="min-h-11 rounded-lg border border-brand/30 px-3 text-sm font-medium text-brand-dark disabled:opacity-40"
        >
          Add date
        </button>
      </div>
      {dates.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {dates.map((date) => (
            <li
              key={date}
              className="flex items-center gap-2 rounded-full bg-brand-light px-3 py-1 text-xs font-medium text-brand-dark"
            >
              {formatDeliveryDate(date)}
              <button
                type="button"
                onClick={() => onRemove(date)}
                aria-label={`Remove ${date}`}
                className="text-brand-dark/70 hover:text-brand-dark"
              >
                &times;
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
