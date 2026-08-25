import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ImageOff,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "../../lib/utils";

/**
 * Reading photos, anywhere in the app.
 *
 * This was born inside devoluciones, where the evidence of a claim is judged.
 * It is here because the question it answers is not a returns question: a
 * completed task carries photos, a visit closes with them, a client's file will
 * have them — and every one of those readers wants the same three things, which
 * is a thumbnail small enough for a row, a pile that says how many there are,
 * and a viewer that lets them zoom in on a batch code.
 *
 * The *writing* side stayed in devoluciones (`PhotosDropzone`), because the
 * rules about how many photos a claim needs, and when, belong to that flow.
 */

/**
 * The image, or a tile where it would be.
 *
 * Seeded data carries the literal `"url"` placeholder the rest of the mock uses,
 * and a photo taken on another device is a URL this browser cannot resolve. Both
 * are the same thing to the user — "there is a photo here, it cannot be shown" —
 * and neither is a broken-image icon.
 */
export function PhotoImg({
  url,
  alt,
  className,
  /** Shown beside the icon when the image cannot be rendered. Roomy views only. */
  fallbackText,
}: {
  url: string;
  alt: string;
  className?: string;
  fallbackText?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);

  if (failed || !url || url === "url") {
    return (
      <span
        className={cn(
          "flex flex-col items-center justify-center gap-1 rounded border bg-muted text-muted-foreground",
          className,
        )}
      >
        <ImageOff className={fallbackText ? "h-6 w-6" : "h-3 w-3"} />
        {fallbackText && <span className="px-2 text-center text-xs">{fallbackText}</span>}
      </span>
    );
  }
  return (
    <img
      src={url}
      alt={alt}
      onError={() => setFailed(true)}
      // Never draggable. An `<img>` drags by default, and dropping one back on
      // the zone it came from makes the browser hand over a synthesized file —
      // so moving a thumbnail a few pixels silently duplicated the photo.
      draggable={false}
      className={className}
    />
  );
}

/**
 * Turn picked or dropped files into the URLs the model stores.
 *
 * Only images survive the filter — a drop is the one gesture where the browser
 * will happily hand over a PDF that the file dialog's `accept` would have
 * refused, so the rule is enforced here rather than on the input alone.
 *
 * There is no backend, so the files never leave the browser: each is held as an
 * object URL, enough for the screen to show it and for the flow to run end to
 * end. The day an upload endpoint exists, this is the only function that
 * changes — everything above it already speaks in URLs.
 *
 * Nothing revokes those URLs. A photo added here outlives this control: it
 * travels onto the line, into the detail table and into the return itself, so
 * releasing it when the dialog closes would blank out exactly the images the
 * user just attached. Session-scoped object URLs are the cheap, correct trade in
 * a browser-only prototype.
 */

export function PhotoStack({ photos, max = 3 }: { photos: string[]; max?: number }) {
  const [open, setOpen] = useState<number | null>(null);

  if (photos.length === 0) {
    return <span className="text-[11px] text-muted-foreground">Sin fotos</span>;
  }

  const shown = photos.slice(0, max);
  const rest = photos.length - shown.length;

  return (
    <>
      <span className="flex items-center">
        {shown.map((url, index) => (
          <button
            key={`${url}_${index}`}
            type="button"
            // The stack often sits in a clickable row; opening a photo is not
            // clicking the row it happens to be in.
            onClick={(e) => {
              e.stopPropagation();
              setOpen(index);
            }}
            aria-label={`Ver foto ${index + 1}`}
            style={{ zIndex: shown.length - index }}
            className={cn(
              "relative shrink-0 rounded-[5px] border-2 border-background transition-shadow hover:z-10 hover:shadow-md",
              index > 0 && "-ml-2",
            )}
          >
            <PhotoImg
              url={url}
              alt={`Foto ${index + 1}`}
              className="h-6 w-6 rounded-[3px] object-cover"
            />
          </button>
        ))}
        {rest > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(max);
            }}
            aria-label={`Ver las otras ${rest} fotos`}
            className="relative -ml-2 flex h-6 min-w-6 shrink-0 items-center justify-center rounded-[5px] border-2 border-background bg-muted px-1 text-[10px] font-medium tabular-nums text-muted-foreground transition-colors hover:z-10 hover:bg-accent hover:text-foreground"
          >
            +{rest}
          </button>
        )}
      </span>

      <PhotoPreviewDialog photos={photos} index={open} onIndexChange={setOpen} />
    </>
  );
}


const MIN_SCALE = 1;
const MAX_SCALE = 6;
/** How far a double-click jumps: enough to read a batch number off a bottle. */
const DOUBLE_CLICK_SCALE = 2.5;

const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));

/**
 * The evidence, full size: a carousel with zoom, pan and full screen.
 *
 * It takes the index rather than the URL for a reason that only shows up in
 * front of a real claim: the approver is looking at four near-identical shots of
 * the same box, and the question is never "what is this photo" but "have I seen
 * the batch stamp yet". So the viewer says which of how many, moves with the
 * arrow keys, and keeps the whole set on screen as a strip — the reading is the
 * sequence, not the picture. It wraps at both ends; with five photos, hitting a
 * wall is an interruption and never information.
 *
 * Zoom is not a nicety here, it is the job. The number that decides a return is
 * a batch code stamped on a shrink-wrapped bottle, photographed at arm's length
 * in a shop — at fit-to-window it is four pixels tall. So the wheel zooms about
 * the cursor rather than about the centre, because the approver is already
 * pointing at the thing he wants bigger; dragging pans once there is something
 * to pan; a double-click jumps to reading distance and back. Full screen is the
 * same gesture at the scale of the monitor.
 *
 * Everything resets on the way to the next photo. Carrying a 4× pan across a
 * boundary lands the approver in the middle of an image he has not seen yet.
 *
 * What it deliberately has not got is anything that changes a pixel. This is
 * evidence in an approval flow — rotating, cropping or adjusting it here would
 * mean the thing the supervisor signed off is not the thing the seller sent.
 */
export function PhotoPreviewDialog({
  photos,
  index,
  onIndexChange,
}: {
  photos: string[];
  /** Which photo is open, or `null` for closed. */
  index: number | null;
  onIndexChange: (index: number | null) => void;
}) {
  const open = index !== null && index >= 0 && index < photos.length;
  const current = open ? index : 0;
  const many = photos.length > 1;

  const contentRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(MIN_SCALE);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const panFrom = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
  const [fullscreen, setFullscreen] = useState(false);

  const zoomed = scale > MIN_SCALE;

  /** Back to fit-to-window, centred. */
  const reset = useCallback(() => {
    setScale(MIN_SCALE);
    setOffset({ x: 0, y: 0 });
  }, []);

  // A new photo is a new reading: neither the zoom nor the pan carries over.
  useEffect(() => reset(), [current, open, reset]);

  /**
   * How far the image may be dragged at a given scale: half the overflow on
   * each axis, so the photo can always be pushed to its own edge and never past
   * it into empty stage.
   */
  const boundsAt = (target: number) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: ((target - 1) * rect.width) / 2, y: ((target - 1) * rect.height) / 2 };
  };

  /**
   * Zoom to `next`, keeping whatever sits under `origin` exactly where it is.
   * `origin` is measured from the centre of the stage, which is also where the
   * transform's own origin lies — that is what makes the algebra this short.
   */
  const zoomTo = useCallback(
    (next: number, origin: { x: number; y: number } = { x: 0, y: 0 }) => {
      const target = clamp(next, MIN_SCALE, MAX_SCALE);
      if (target === scale) return;
      if (target === MIN_SCALE) {
        reset();
        return;
      }
      const ratio = target / scale;
      const max = boundsAt(target);
      setScale(target);
      setOffset({
        x: clamp(origin.x - (origin.x - offset.x) * ratio, -max.x, max.x),
        y: clamp(origin.y - (origin.y - offset.y) * ratio, -max.y, max.y),
      });
    },
    [scale, offset, reset],
  );

  /** Pointer position relative to the centre of the stage. */
  const originOf = (e: { clientX: number; clientY: number }) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: e.clientX - rect.left - rect.width / 2,
      y: e.clientY - rect.top - rect.height / 2,
    };
  };

  const go = useCallback(
    (delta: number) => {
      if (photos.length === 0) return;
      onIndexChange((current + delta + photos.length) % photos.length);
    },
    [current, photos.length, onIndexChange],
  );

  const toggleFullscreen = useCallback(() => {
    const el = contentRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  }, []);

  useEffect(() => {
    const sync = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  // Closing the dialog from full screen must not leave the browser in it.
  useEffect(() => {
    if (!open && document.fullscreenElement) void document.exitFullscreen();
  }, [open]);

  /**
   * The wheel, bound by hand because React registers its own wheel listener as
   * passive — `preventDefault` inside `onWheel` is ignored, and the page scrolls
   * out from under the zoom.
   */
  useEffect(() => {
    const el = stageRef.current;
    if (!open || !el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomTo(scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15), originOf(e));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [open, scale, zoomTo]);

  // The keyboard anybody already expects from a photo viewer.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (many && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        e.preventDefault();
        go(e.key === "ArrowRight" ? 1 : -1);
        return;
      }
      if (e.key === "+" || e.key === "=") zoomTo(scale * 1.4);
      else if (e.key === "-") zoomTo(scale / 1.4);
      else if (e.key === "0") reset();
      else if (e.key.toLowerCase() === "f") toggleFullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, many, go, scale, zoomTo, reset, toggleFullscreen]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onIndexChange(null)}>
      <DialogContent
        ref={contentRef}
        className="max-w-6xl gap-2 p-3"
        /**
         * Inline, because full screen has to beat the dialog's own centring and
         * no utility class can — but the load-bearing line here is `translate`.
         *
         * The browser's `:fullscreen` rules pin the element to the viewport with
         * `!important`, and they reset `transform` — they do not reset
         * `translate`, which did not exist when that stylesheet was written.
         * Tailwind v4 compiles `translate-x-[-50%]` to the standalone
         * `translate` property, so the dialog went full screen and then slid
         * half a screen up and to the left, still obeying a centring rule for a
         * box it was no longer in. Everything else here is belt and braces.
         */
        style={{
          display: "flex",
          flexDirection: "column",
          ...(fullscreen
            ? {
                inset: 0,
                width: "100vw",
                height: "100vh",
                maxWidth: "none",
                maxHeight: "none",
                margin: 0,
                translate: "none",
                transform: "none",
                borderRadius: 0,
              }
            : {}),
        }}
        aria-describedby={undefined}
      >
        <div className="flex shrink-0 items-baseline gap-2 pr-8">
          <DialogTitle className="text-sm">Evidencia</DialogTitle>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {current + 1} / {photos.length}
          </span>
          <span className="ml-auto hidden text-[11px] text-muted-foreground md:block">
            {many && "← → pasar · "}rueda o doble clic para acercar · F pantalla completa
          </span>
        </div>

        {/* The stage. A recessed surface behind the photo so a shot with a white
            background still reads as a photo and not as a hole in the dialog. */}
        <div
          ref={stageRef}
          onPointerDown={(e) => {
            if (!zoomed) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            panFrom.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
            setPanning(true);
          }}
          onPointerMove={(e) => {
            if (!panning) return;
            const max = boundsAt(scale);
            setOffset({
              x: clamp(panFrom.current.ox + e.clientX - panFrom.current.x, -max.x, max.x),
              y: clamp(panFrom.current.oy + e.clientY - panFrom.current.y, -max.y, max.y),
            });
          }}
          onPointerUp={() => setPanning(false)}
          onPointerCancel={() => setPanning(false)}
          onDoubleClick={(e) => zoomTo(zoomed ? MIN_SCALE : DOUBLE_CLICK_SCALE, originOf(e))}
          className={cn(
            "relative flex min-h-0 flex-1 select-none items-center justify-center overflow-hidden rounded-lg bg-muted/40 p-2 touch-none",
            !fullscreen && "min-h-[26rem]",
            panning ? "cursor-grabbing" : zoomed ? "cursor-grab" : "cursor-zoom-in",
          )}
        >
          {open && (
            <div
              style={{
                transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                maxHeight: fullscreen ? "100%" : "72vh",
              }}
              className={cn(
                "flex max-w-full items-center justify-center",
                !panning && "transition-transform duration-150 ease-out",
              )}
            >
              <PhotoImg
                key={photos[current]}
                url={photos[current]}
                alt={`Foto ${current + 1}`}
                fallbackText="Esta foto no se puede mostrar en el navegador."
                className="max-h-full max-w-full rounded-md object-contain shadow-sm"
              />
            </div>
          )}

          {many && (
            <>
              <CarouselArrow side="left" onClick={() => go(-1)} />
              <CarouselArrow side="right" onClick={() => go(1)} />
            </>
          )}

          {/* The toolbar floats over the stage instead of sitting under it: at
              full screen there is no "under", and a control that moves house
              between the two modes is a control the user has to find twice. */}
          <div
            onPointerDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-full border bg-background/90 p-0.5 shadow-sm backdrop-blur"
          >
            <StageButton
              label="Alejar"
              icon={ZoomOut}
              disabled={scale <= MIN_SCALE}
              onClick={() => zoomTo(scale / 1.4)}
            />
            {/* The percentage is the reset: one less icon, and the control the
                user reaches for is the one already telling him he is at 340%. */}
            <button
              type="button"
              onClick={reset}
              disabled={!zoomed}
              title="Ajustar a la ventana"
              className="min-w-12 rounded-full px-1.5 py-1 font-mono text-[11px] tabular-nums text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none"
            >
              {Math.round(scale * 100)}%
            </button>
            <StageButton
              label="Acercar"
              icon={ZoomIn}
              disabled={scale >= MAX_SCALE}
              onClick={() => zoomTo(scale * 1.4)}
            />
            <span className="mx-0.5 h-4 w-px bg-border" />
            <StageButton
              label={fullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
              icon={fullscreen ? Minimize2 : Maximize2}
              onClick={toggleFullscreen}
            />
          </div>
        </div>

        {many && (
          <div className="flex shrink-0 gap-1.5 overflow-x-auto pb-0.5">
            {photos.map((url, i) => (
              <button
                key={`${url}_${i}`}
                type="button"
                onClick={() => onIndexChange(i)}
                aria-label={`Ver foto ${i + 1}`}
                aria-current={i === current}
                className={cn(
                  "shrink-0 overflow-hidden rounded-md border-2 transition-all",
                  i === current
                    ? "border-primary"
                    : "border-transparent opacity-50 hover:opacity-100",
                )}
              >
                <PhotoImg url={url} alt={`Foto ${i + 1}`} className="h-12 w-12 object-cover" />
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** One side of the carousel. Floats over the stage, out of the photo's way. */
function CarouselArrow({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onClick={onClick}
      aria-label={side === "left" ? "Foto anterior" : "Foto siguiente"}
      className={cn(
        "absolute top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border bg-background/85 text-muted-foreground shadow-sm backdrop-blur transition-colors hover:bg-background hover:text-foreground",
        side === "left" ? "left-2" : "right-2",
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

/** One control of the floating toolbar. */
function StageButton({
  label,
  icon: Icon,
  onClick,
  disabled,
}: {
  label: string;
  icon: typeof ZoomIn;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}
