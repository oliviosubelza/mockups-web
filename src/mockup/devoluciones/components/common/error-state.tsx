import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "../../lib/utils";

/**
 * A request that failed, and the one thing worth offering: try again.
 *
 * Separate from `EmptyState` because they say opposite things. "No hay nada" is
 * an answer — the screen worked and the answer is zero. "No se pudo cargar" is
 * the absence of an answer, and dressing it in the same dashed calm box teaches
 * people to read a broken screen as an empty one.
 *
 * The technical message is shown rather than swallowed. In a prototype wired to
 * a mock service it is usually the only clue there is, and hiding it behind
 * "algo salió mal" helps nobody.
 */
export function ErrorState({
  title = "No se pudo cargar",
  description,
  error,
  onRetry,
  className,
}: {
  title?: string;
  description?: string;
  /** The failure itself. Its message is shown verbatim when there is one. */
  error?: Error | null;
  onRetry?: () => void;
  className?: string;
}) {
  const detail = description ?? error?.message;

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-destructive/30 bg-destructive/[0.04] px-6 py-14 text-center",
        className,
      )}
      role="alert"
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <h3 className="text-sm font-semibold">{title}</h3>
      {detail && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{detail}</p>}
      {onRetry && (
        <Button variant="outline" className="mt-4" onClick={onRetry}>
          <RotateCw className="h-4 w-4" /> Reintentar
        </Button>
      )}
    </div>
  );
}
