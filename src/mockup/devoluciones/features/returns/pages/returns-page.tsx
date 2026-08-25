import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { Plus, X } from "lucide-react";
import type { ReturnStatus } from "../../../types";
import { ALL_RETURN_STATUSES, RETURN_STATUS_LABELS } from "../../../types";
import { PageHeader } from "../../../components/common/page-header";
import { Pagination } from "../../../components/common/pagination";
import { DateRangeFilter, type DateRange } from "../../../components/common/date-range-filter";
import { Button } from "@/components/ui/button";
import { Combobox } from "../../../components/ui/combobox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import { dateKeyOffset } from "../../../lib/frequency";
import { useAllSellers } from "../../../hooks/use-sellers";
import { useReturnsPaged } from "../../../hooks/use-returns";
import { seesOwnDocumentsOnly, useCurrentUser } from "../../../stores/session-store";
import { ReturnsTable } from "../components/returns-table";
import { ReturnsTabs } from "../components/returns-tabs";

const PAGE_SIZE_OPTIONS = [10, 20, 50];
/** Default window: the last two weeks. A return takes days to be decided. */
const DEFAULT_RANGE: DateRange = { from: dateKeyOffset(-13), to: dateKeyOffset(0) };

/**
 * Devoluciones, as one list.
 *
 * Deliberately without the tabs that pedidos has: an order is stored once and
 * read two ways — as agreed and as invoiced — while a return is one claim with
 * one life. What replaces that switch here is the status filter, because the
 * question this screen is really asked is not "how do I read these" but "which
 * ones are waiting for me".
 *
 * For a seller the list is their own book: the seller filter is not narrowed,
 * it is *gone*, because a filter implies a choice and there is none — the code
 * on the session is the only value the query will ever carry.
 */
export function ReturnsPage() {
  const user = useCurrentUser();
  const ownOnly = seesOwnDocumentsOnly(user.role);
  const [range, setRange] = useState<DateRange>(DEFAULT_RANGE);
  const [search, setSearch] = useState("");
  const [sellerCode, setSellerCode] = useState("all");
  const [status, setStatus] = useState<ReturnStatus | "all">("all");
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);

  const { data: sellers = [] } = useAllSellers();
  const sellerOptions = useMemo(
    () => [
      { value: "all", label: "Todos los vendedores" },
      ...sellers.map((s) => ({ value: String(s.code), label: s.name })),
    ],
    [sellers],
  );

  // Server-side filtering: any filter change goes back to page 1.
  useEffect(() => setPage(1), [range.from, range.to, search, sellerCode, status, pageSize]);

  // The seller's own code is not a filter the user picked, so it overrides
  // whatever the (hidden) control holds.
  const effectiveSellerCode: number | "all" = ownOnly
    ? (user.sellerCode ?? "all")
    : sellerCode === "all"
      ? "all"
      : Number(sellerCode);

  const query = {
    from: range.from,
    to: range.to,
    search,
    sellerCode: effectiveSellerCode,
    status,
    page,
    limit: pageSize,
  };

  const { data, isLoading, isFetching } = useReturnsPaged(query);
  const rows = data?.data ?? [];
  const pagination = data?.pagination;
  const totalItems = pagination?.totalItems ?? 0;
  const totalPages = pagination?.totalPages ?? 1;
  const hasFilters =
    search !== "" ||
    (!ownOnly && sellerCode !== "all") ||
    status !== "all" ||
    range.from !== DEFAULT_RANGE.from ||
    range.to !== DEFAULT_RANGE.to;

  useEffect(() => {
    if (pagination && page > pagination.totalPages) setPage(pagination.totalPages);
  }, [pagination, page]);

  const displayRange = useMemo(() => {
    if (totalItems === 0) return null;
    return {
      start: (page - 1) * pageSize + 1,
      end: Math.min(page * pageSize, totalItems),
    };
  }, [page, pageSize, totalItems]);

  const clearFilters = () => {
    setRange(DEFAULT_RANGE);
    setSearch("");
    setSellerCode("all");
    setStatus("all");
  };

  return (
    <>
      <PageHeader
        title="Devoluciones"
        description={
          ownOnly
            ? "Las devoluciones que registraste, con su evidencia y el estado de su aprobación."
            : "Mercadería que vuelve del cliente, con su evidencia y su flujo de aprobación."
        }
      >
        <Button asChild>
          <Link to="/devoluciones/nueva">
            <Plus className="h-4 w-4" /> Nueva devolución
          </Link>
        </Button>
      </PageHeader>

      <ReturnsTabs />

      {/* Every filter in one bar; the search box is in the table's own toolbar, over the list it
          narrows. */}
      <div className="mb-3">
        <DateRangeFilter value={range} onChange={setRange}>
          {!ownOnly && (
            <Combobox
              options={sellerOptions}
              value={sellerCode}
              onChange={setSellerCode}
              placeholder="Vendedor"
              searchPlaceholder="Buscar vendedor…"
              className="h-8 w-full text-sm sm:w-48"
            />
          )}
          <Select value={status} onValueChange={(v) => setStatus(v as ReturnStatus | "all")}>
            <SelectTrigger className="h-8 w-full text-sm sm:w-48">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              {ALL_RETURN_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {RETURN_STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8">
              <X className="h-4 w-4" /> Limpiar
            </Button>
          )}
        </DateRangeFilter>
      </div>

      {/* Kept mounted with no rows: the search box lives in the toolbar, and a search that finds
          nothing cannot take away the box that would undo it. */}
      <div className={isFetching && !isLoading ? "opacity-70 transition-opacity" : undefined}>
        <ReturnsTable
          returns={rows}
          loading={isLoading}
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Buscar por cliente…"
        />
      </div>

      {totalItems > 0 && (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Filas por página</span>
              <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                <SelectTrigger className="h-8 w-[72px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {displayRange && (
              <p className="text-sm text-muted-foreground">
                Mostrando{" "}
                <span className="font-medium text-foreground">
                  {displayRange.start}–{displayRange.end}
                </span>{" "}
                de <span className="font-medium text-foreground">{totalItems}</span>
              </p>
            )}
          </div>
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      )}
    </>
  );
}
