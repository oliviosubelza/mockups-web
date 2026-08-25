import { useRef, useState } from "react";
import { ImageUp, X } from "lucide-react";
import { toast } from "sonner";
import { PhotoImg, PhotoPreviewDialog } from "../../../components/common/photo-viewer";
import { cn } from "../../../lib/utils";

/**
 * Attaching photos to a return.
 *
 * The *reading* half of this — the thumbnail, the stack, the zoomable viewer —
 * moved to `@/components/common/photo-viewer` once a completed task needed the
 * same thing. What stayed is the part that is about devoluciones: how many
 * photos a claim may carry, what counts as one, and the surface a seller drops
 * them on.
 */

/** How many photos one returned product may carry. */
export const MAX_PHOTOS = 5;

/** What the file picker and the drop zone accept — images and nothing else. */
const IMAGE_ACCEPT = "image/*";

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
function urlsFromFiles(
  files: FileList | File[] | null,
  room: number,
  max: number,
): string[] | null {
  const picked = files ? Array.from(files) : [];
  if (picked.length === 0) return null;

  const images = picked.filter((file) => file.type.startsWith("image/"));
  if (images.length === 0) {
    toast.error("Solo se pueden adjuntar imágenes", {
      description: "El archivo que soltaste no es una foto.",
    });
    return null;
  }
  if (images.length < picked.length) {
    toast.info("Se descartaron los archivos que no son imágenes.");
  }

  if (room <= 0) {
    toast.warning(`Ya hay ${max} fotos`, {
      description: "Quitá alguna para poder adjuntar otra.",
    });
    return null;
  }
  const accepted = images.slice(0, room);
  if (accepted.length < images.length) {
    toast.warning(`Se adjuntaron ${accepted.length} de ${images.length} fotos`, {
      description: `El límite es de ${max} fotos por producto.`,
    });
  }
  return accepted.map((file) => URL.createObjectURL(file));
}

interface PhotosDropzoneProps {
  photos: string[];
  onChange: (photos: string[]) => void;
  /** Off until the form has something to attach photos to. */
  disabled?: boolean;
  max?: number;
}

/**
 * The evidence, as the surface it actually is.
 *
 * A seller carrying a phone has the photos in a folder and drags them in; a
 * seller on a desktop clicks and picks. Both are the same target here: the whole
 * zone takes a drop, and a click anywhere on it opens the picker filtered to
 * images. The same rule — images only, up to `max` — is enforced on both paths,
 * because a drop is the one gesture that will happily hand over a PDF the file
 * dialog's `accept` would have refused.
 *
 * The photos already attached live *inside* the zone, as cards. Putting them
 * below turned one control into two things stacked, and the seller had to work
 * out that the strip underneath belonged to the box above it. Inside, the zone
 * simply fills up as he loads it, which is what it looks like it should do.
 *
 * The click surface is one absolutely-positioned button behind the content
 * rather than a `<button>` wrapping it: a remove control nested in a clickable
 * area means every miss reopens the file dialog, when the gesture the seller
 * wanted was "get rid of this one".
 *
 * The zone is grey at rest, never red. Missing evidence is stated once at the
 * bottom of the dialog; painting the control itself makes the form look broken
 * before anybody has done anything wrong. It turns `primary` on drag — the one
 * moment where colour answers a question the seller is asking right then: *will
 * it land here?*
 */
export function PhotosDropzone({
  photos,
  onChange,
  disabled,
  max = MAX_PHOTOS,
}: PhotosDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<number | null>(null);

  const full = photos.length >= max;
  const closed = disabled || full;

  const add = (files: FileList | File[] | null) => {
    const urls = urlsFromFiles(files, max - photos.length, max);
    if (urls) onChange([...photos, ...urls]);
  };

  const removeAt = (index: number) => onChange(photos.filter((_, i) => i !== index));

  return (
    <div className="space-y-1.5">
      <input
        ref={inputRef}
        type="file"
        accept={IMAGE_ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => {
          add(e.target.files);
          e.target.value = "";
        }}
      />

      <div
        onDragOver={(e) => {
          // Only a drag carrying files is a drag this zone can answer. Anything
          // dragged from inside the page — a thumbnail, a selection — is not an
          // upload, and lighting up for it promises something that must not
          // happen.
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          if (!closed) setDragging(true);
        }}
        // `dragleave` also fires when the pointer crosses onto the icon, the
        // caption or a thumbnail inside the zone, which would flicker the
        // highlight the whole way in. Only a leave that lands outside counts.
        onDragLeave={(e) => {
          const next = e.relatedTarget;
          if (next instanceof Node && e.currentTarget.contains(next)) return;
          setDragging(false);
        }}
        onDrop={(e) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          setDragging(false);
          if (!closed) add(e.dataTransfer.files);
        }}
        className={cn(
          "relative flex min-h-[8.5rem] flex-col items-center justify-center gap-2.5 rounded-lg border border-dashed p-3 text-center transition-colors",
          dragging
            ? "border-primary bg-primary/10 text-primary"
            : disabled
              ? "border-input bg-muted/30 text-muted-foreground opacity-60"
              : "border-input text-muted-foreground hover:bg-accent/50",
        )}
      >
        {/* The click surface, behind everything. */}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={closed}
          aria-label="Agregar fotos"
          className="absolute inset-0 h-full w-full rounded-lg disabled:cursor-not-allowed"
        />

        {photos.length > 0 && (
          <div className="relative flex flex-wrap items-center justify-center gap-2">
            {photos.map((url, index) => (
              <span key={`${url}_${index}`} className="group relative shrink-0">
                <button
                  type="button"
                  onClick={() => setPreview(index)}
                  aria-label={`Ver foto ${index + 1}`}
                  className="block overflow-hidden rounded-md border bg-card shadow-xs transition-colors hover:border-primary"
                >
                  <PhotoImg url={url} alt={`Foto ${index + 1}`} className="h-16 w-16 object-cover" />
                </button>
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => removeAt(index)}
                    aria-label={`Quitar foto ${index + 1}`}
                    className="absolute -right-1.5 -top-1.5 rounded-full border bg-background p-0.5 text-muted-foreground shadow-xs transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </span>
            ))}
          </div>
        )}

        {/* Pointer-events off so the caption never eats a click meant for the
            surface underneath it. */}
        <div className="pointer-events-none relative flex flex-col items-center gap-1">
          <ImageUp className="h-5 w-5" />
          <span className="text-xs font-medium">
            {full
              ? `Llegaste al límite de ${max} fotos`
              : dragging
                ? "Soltá las fotos acá"
                : "Arrastrá las fotos o hacé clic para elegirlas"}
          </span>
        </div>
      </div>

      <div className="flex items-baseline justify-between gap-2 text-[11px] text-muted-foreground">
        <span>Máximo {max} imágenes</span>
        <span className="font-mono tabular-nums">
          {photos.length}/{max}
        </span>
      </div>

      <PhotoPreviewDialog photos={photos} index={preview} onIndexChange={setPreview} />
    </div>
  );
}

