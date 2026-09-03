// EL DIÁLOGO DE REACTIVACIÓN — reabrir una devolución que un escritorio ya rechazó.
//
// PIDE TRES COSAS, Y SON LAS DEL SISTEMA QUE ESTA PANTALLA REEMPLAZA. Su modal «Revertir Devolución»
// pide el mensaje de la reversión, muestra el motivo sin dejar editarlo y exige **al menos una
// fotografía de la autorización**. Las tres están acá por la misma razón por la que están allá: nada
// del reclamo cambia al reabrirlo —los productos, las cantidades y la selección del Nivel 1 quedan
// como están—, así que lo único que este diálogo captura es POR QUÉ y CON QUÉ AUTORIZACIÓN un
// documento cerrado vuelve a moverse.
//
// LA FOTO NO ES UN ADJUNTO OPCIONAL, ES LA AUTORIZACIÓN. Reabrir una nota que un gerente rechazó es
// pasar por encima de una firma; la foto del papel firmado es lo que hace que esa decisión tenga
// dueño fuera del sistema. Por eso bloquea el botón, igual que el mensaje.
//
// EL MOTIVO VA EN SOLO LECTURA y no como un campo más: reactivar no reclasifica nada. Está para que
// quien autoriza vea qué está reabriendo, no para que lo cambie. Nuestro modelo guarda el motivo por
// LÍNEA y no en la cabecera, así que se muestran los motivos distintos que trae la nota — que en la
// enorme mayoría de los casos es uno solo.
//
// UN DIÁLOGO Y NO UNA PANTALLA, al revés del formulario de motivos: acá no hay nada que sobreviva a
// un F5 ni que valga la pena compartir por link.
//
// SE USA DESDE DOS LUGARES: el menú de la fila en la bandeja y la ficha de la devolución. Es el mismo
// diálogo en los dos, porque es la misma decisión y dos copias serían dos validaciones que se separan.
import { useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, Loader2, RotateCcw, X } from "lucide-react";
import type { Return } from "../../../types";
import { RETURN_REASON_LABELS } from "../../../types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** Un «ok» no explica nada. Es el mismo piso que pide el rechazo. */
const MIN_REACTIVATION_REASON = 10;

/** Lo que el sistema viejo pide: «1 Fotografías (min.)». */
const MIN_REACTIVATION_PHOTOS = 1;

/** Una foto elegida: el archivo y la URL local con la que se previsualiza. */
interface FotoElegida {
  id: string;
  nombre: string;
  url: string;
}

export function ReactivateDialog({
  open,
  onOpenChange,
  ret,
  loading,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** La devolución que se reabre. Se pasa entera porque el diálogo muestra su motivo. */
  ret: Return;
  loading?: boolean;
  onConfirm: (input: { reason: string; photos: string[] }) => void;
}) {
  const [reason, setReason] = useState("");
  const [fotos, setFotos] = useState<FotoElegida[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  /** Los motivos que trae la nota. Casi siempre uno; se muestran todos si son varios. */
  const motivos = useMemo(
    () => [...new Set(ret.lines.map((l) => RETURN_REASON_LABELS[l.reason]))],
    [ret.lines],
  );

  // Se limpia al ABRIR y no al cerrar: si la mutación falla, el diálogo sigue abierto con lo escrito
  // y las fotos ya elegidas, y quien reintenta no tiene que volver a cargarlas.
  useEffect(() => {
    if (open) {
      setReason("");
      setFotos([]);
    }
  }, [open, ret.id]);

  // NO SE REVOCAN AL DESMONTAR, a propósito. La URL de una foto confirmada viaja a la acción del
  // workflow y la línea de tiempo la va a mostrar después de que este diálogo se cerró: revocarla en
  // el cleanup blanquearía exactamente la evidencia que se acaba de adjuntar. Es la misma decisión
  // que ya está tomada y explicada en `components/common/photo-viewer.tsx`. Solo se revoca la foto
  // que el usuario QUITA, que es la única que nadie más va a mirar.

  const agregarFotos = (lista: FileList | null) => {
    if (!lista || lista.length === 0) return;
    const nuevas = Array.from(lista).map((file) => ({
      id: `${file.name}-${file.size}-${file.lastModified}`,
      nombre: file.name,
      url: URL.createObjectURL(file),
    }));
    // Por id —nombre + tamaño + fecha—: elegir dos veces el mismo archivo no son dos evidencias.
    setFotos((actuales) => {
      const vistos = new Set(actuales.map((f) => f.id));
      return [...actuales, ...nuevas.filter((f) => !vistos.has(f.id))];
    });
    // El input se limpia para que volver a elegir EL MISMO archivo dispare el `change` de nuevo.
    if (fileRef.current) fileRef.current.value = "";
  };

  const quitarFoto = (id: string) => {
    setFotos((actuales) => {
      const fuera = actuales.find((f) => f.id === id);
      if (fuera) URL.revokeObjectURL(fuera.url);
      return actuales.filter((f) => f.id !== id);
    });
  };

  const faltanLetras = MIN_REACTIVATION_REASON - reason.trim().length;
  const faltanFotos = MIN_REACTIVATION_PHOTOS - fotos.length;
  const bloqueo =
    faltanLetras > 0
      ? `Faltan ${faltanLetras} caracteres del mensaje`
      : faltanFotos > 0
        ? 'Adjuntá la fotografía de la autorización'
        : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="size-4 text-amber-600 dark:text-amber-400" />
            Reactivar la devolución {ret.id}
          </DialogTitle>
          <DialogDescription>
            {ret.clientName}. La nota vuelve a subir la escalera de aprobación tal como está: los
            productos y las cantidades que el Nivel 1 dejó en pie no cambian, y ningún escritorio
            vuelve a elegir ítems.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="reactivate-reason" className="text-xs font-semibold">
              Mensaje de la reactivación<span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="reactivate-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Por qué se reabre un documento que ya fue rechazado"
              rows={3}
              maxLength={500}
              autoFocus
            />
            <p className="text-[11px] leading-snug text-muted-foreground">
              Queda en la línea de tiempo. Es lo que explica la segunda vuelta.
            </p>
          </div>

          {/* Solo lectura: reactivar no reclasifica la nota. */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Motivo</Label>
            <Input value={motivos.join(' · ')} readOnly disabled className="h-9" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">
              Fotografía de la autorización<span className="text-destructive">*</span>
            </Label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => agregarFotos(e.target.files)}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
                disabled={loading}
              >
                <ImagePlus className="size-4" />
                Adjuntar imagen
              </Button>
              <span className="text-[11px] text-muted-foreground">
                {fotos.length === 0
                  ? 'Al menos 1 fotografía.'
                  : `${fotos.length} ${fotos.length === 1 ? 'fotografía' : 'fotografías'}`}
              </span>
            </div>
            {fotos.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {fotos.map((f) => (
                  <div key={f.id} className="relative">
                    <img
                      src={f.url}
                      alt={f.nombre}
                      title={f.nombre}
                      className="size-16 rounded border object-cover"
                    />
                    <button
                      type="button"
                      aria-label={`Quitar ${f.nombre}`}
                      onClick={() => quitarFoto(f.id)}
                      className="absolute -right-1.5 -top-1.5 rounded-full border bg-background p-0.5 text-muted-foreground shadow-sm hover:text-destructive"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          {bloqueo && <span className="mr-auto text-xs text-muted-foreground">{bloqueo}</span>}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button
            onClick={() => onConfirm({ reason: reason.trim(), photos: fotos.map((f) => f.url) })}
            disabled={!!loading || bloqueo !== null}
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
            Reactivar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
