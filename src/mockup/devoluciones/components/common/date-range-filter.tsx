import { CalendarRange } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

export interface DateRange {
  /** Inclusive `YYYY-MM-DD` bounds; empty string = open end. */
  from: string;
  to: string;
}

interface DateRangeFilterProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  /**
   * The list's other filters (estado, vendedor, empresa…), inline with the dates. They answer the
   * same question the dates do — *which* rows — so they are one bar and not two; the search box, a
   * different question, moved into the table's own toolbar next to columns and density.
   */
  children?: React.ReactNode;
}

/**
 * Date-range filter: two native date inputs. Swapping the bounds is corrected
 * on change, so `from` is never after `to`.
 *
 * The preset chips — Hoy, Ayer, 7 días, 30 días, Este mes — used to sit between
 * the label and the inputs. They were five permanent controls buying one click
 * each, on a bar that already carries four or five other filters, and the row
 * they took is the room those filters needed. Every screen using this arrives
 * with a sensible default period anyway, so the presets were answering a
 * question the page had already answered.
 */
export function DateRangeFilter({ value, onChange, children }: DateRangeFilterProps) {
  const setFrom = (from: string) =>
    onChange({ from, to: value.to && from && from > value.to ? from : value.to });
  const setTo = (to: string) =>
    onChange({ from: value.from && to && to < value.from ? to : value.from, to });

  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-card p-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-2">
      <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <CalendarRange className="h-4 w-4" /> Rango de fechas
      </span>

      <div className="flex items-center gap-2">
        <Input
          type="date"
          value={value.from}
          max={value.to || undefined}
          onChange={(e) => setFrom(e.target.value)}
          className="h-8 w-[9.5rem] text-sm"
          aria-label="Desde"
        />
        <span className="text-xs text-muted-foreground">a</span>
        <Input
          type="date"
          value={value.to}
          min={value.from || undefined}
          onChange={(e) => setTo(e.target.value)}
          className="h-8 w-[9.5rem] text-sm"
          aria-label="Hasta"
        />
      </div>

      {/* A hairline, not a second row: the dates set the period and these narrow what happened
          inside it, so they belong to the same sentence — the rule only says where it turns. */}
      {children && <Separator orientation="vertical" className="hidden h-5 sm:block" />}
      {children}
    </div>
  );
}
