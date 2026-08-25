import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router";
import { CheckCheck } from "lucide-react";
import { PageHeader } from "../../../components/common/page-header";
import { EmptyState } from "../../../components/common/empty-state";
import { ErrorState } from "../../../components/common/error-state";
import { Pagination } from "../../../components/common/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import { useMyApprovals } from "../../../hooks/use-returns";
import { canApproveReturns, useCurrentUser } from "../../../stores/session-store";
import { ApprovalsTable } from "../components/approvals-table";
import { ReturnsTabs } from "../components/returns-tabs";

const PAGE_SIZE_OPTIONS = [10, 20, 50];

/**
 * Only what is waiting on this approver's signature.
 *
 * No date filter, unlike the general list: a queue is not browsed by period, it
 * is worked through. What it is sorted and filtered by instead is urgency —
 * which of these is late — because that is the only ordering an approver
 * actually wants.
 */
export function ApprovalsPage() {
  const user = useCurrentUser();
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);

  useEffect(() => setPage(1), [search, pageSize]);

  const { data, isLoading, isFetching, isError, error, refetch } = useMyApprovals(user.employeeCode, {
    search,
    page,
    limit: pageSize,
  });

  const rows = data?.data ?? [];
  const pagination = data?.pagination;
  const totalItems = pagination?.totalItems ?? 0;
  const totalPages = pagination?.totalPages ?? 1;

  useEffect(() => {
    if (pagination && page > pagination.totalPages) setPage(pagination.totalPages);
  }, [pagination, page]);

  const displayRange = useMemo(() => {
    if (totalItems === 0) return null;
    return { start: (page - 1) * pageSize + 1, end: Math.min(page * pageSize, totalItems) };
  }, [page, pageSize, totalItems]);

  // A seller has no approver identity at all, and no longer any way in here: the
  // tab is gone for them, so the address is all that is left and it goes back to
  // the list that is actually theirs.
  if (!canApproveReturns(user.role) || !user.employeeCode) {
    return <Navigate to="/devoluciones" replace />;
  }

  return (
    <>
      <PageHeader
        title="Devoluciones"
        description={`Esperan tu decisión como ${user.name}.`}
      />
      <ReturnsTabs />

      {isError ? (
        <ErrorState
          description="No se pudo traer tu cola de aprobaciones."
          error={error as Error}
          onRetry={() => refetch()}
        />
      ) : !isLoading && totalItems === 0 && !search ? (
        // An empty queue is good news and deserves to be said out loud. An empty *search* is not
        // the same thing: there the table stays, because its toolbar holds the box to clear.
        <EmptyState
          icon={CheckCheck}
          title="No tenés nada pendiente"
          description="Ninguna devolución espera tu firma en este momento."
        />
      ) : (
        <div className={isFetching && !isLoading ? "opacity-70 transition-opacity" : undefined}>
          <ApprovalsTable
            returns={rows}
            loading={isLoading}
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Buscar por cliente…"
          />
        </div>
      )}

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
