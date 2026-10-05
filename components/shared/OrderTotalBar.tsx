import { formatINR } from "@/lib/business-logic/pricing";
import { Button } from "@/components/ui/Button";

type OrderTotalBarProps = {
  /** Plain-language summary, e.g. "6 days · Nutri Box" — never internal counts like "1 date · 2 boxes". */
  summary: string;
  /** Optional second line, e.g. "6 days × ₹69". */
  breakdown?: string;
  total: number;
  onContinue: () => void;
  validationMessage: string | null;
};

export function OrderTotalBar({
  summary,
  breakdown,
  total,
  onContinue,
  validationMessage,
}: OrderTotalBarProps) {
  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm text-foreground/70">{summary}</p>
          {breakdown && <p className="text-xs text-foreground/50">{breakdown}</p>}
        </div>
        <span className="shrink-0 text-base font-semibold text-foreground">
          {formatINR(total)}
        </span>
      </div>
      {validationMessage && (
        <p className="mt-1 text-xs font-medium text-red-600">{validationMessage}</p>
      )}
      <Button className="mt-3 w-full" onClick={onContinue}>
        Continue
      </Button>
    </div>
  );
}
