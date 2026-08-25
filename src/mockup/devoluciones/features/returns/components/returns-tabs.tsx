import { NavLink } from "react-router";
import { canApproveReturns, useCurrentUser } from "../../../stores/session-store";
import { useMyApprovals } from "../../../hooks/use-returns";
import { cn } from "../../../lib/utils";

/**
 * The two lenses on devoluciones.
 *
 * Tabs and not sidebar entries: "todas" and "mis aprobaciones" are the same
 * resource under a different filter, and sending someone back to the sidebar to
 * switch between them treats a change of lens as a change of place.
 *
 * The count on "mis aprobaciones" is the reason an approver opens the app at
 * all, so it is loaded here rather than on arrival.
 */
export function ReturnsTabs() {
  const user = useCurrentUser();
  const { data } = useMyApprovals(user.employeeCode, { limit: 1 });
  const pending = data?.pagination.totalItems ?? 0;

  const tabs: { to: string; label: string; end: boolean; count?: number }[] = [
    { to: "/devoluciones", label: "Todas", end: true },
    // A seller signs nothing, so the queue would always be empty for them.
    ...(canApproveReturns(user.role) && user.employeeCode
      ? [{ to: "/devoluciones/aprobaciones", label: "Mis aprobaciones", count: pending, end: false }]
      : []),
  ];

  // One tab is not a choice: without a second lens the bar only draws a line
  // under a word the page title already said.
  if (tabs.length < 2) return null;

  return (
    <div className="mb-3 flex flex-wrap items-center gap-1 border-b">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) =>
            cn(
              "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors",
              isActive
                ? "border-primary font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )
          }
        >
          {tab.label}
          {tab.count !== undefined && tab.count > 0 && (
            <span className="rounded-full bg-amber-500/15 px-1.5 py-px text-[10px] font-medium tabular-nums text-amber-700 dark:text-amber-400">
              {tab.count}
            </span>
          )}
        </NavLink>
      ))}
    </div>
  );
}
