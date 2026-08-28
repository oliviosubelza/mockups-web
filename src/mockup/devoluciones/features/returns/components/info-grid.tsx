// LA INFO DEL DETALLE, EN PANELES — cada panel es una `Card` chica con su propio título (Cliente,
// Devolución, En curso) y va LADO A LADO con los otros, no apilado. Eso es lo que ahorra el espacio:
// tres bloques de seis-diez campos apilados uno debajo del otro suman media pantalla de alto; los
// mismos tres bloques lado a lado ocupan lo que ocupa el más alto de los tres, una sola vez.
//
// SIN CAJA DE INPUT. La versión anterior dibujaba cada campo como un input de solo lectura (borde,
// fondo) — separaba bien los datos pero cada campo pesaba una caja entera. Acá el panel ya separa
// por sí solo (es su propia tarjeta), así que adentro el campo vuelve a ser lo mínimo: etiqueta chica
// arriba, valor abajo, sin borde ni fondo.
import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "../../../lib/utils";

export function InfoCard({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("min-w-[260px] flex-1 gap-2 py-2.5", className)}>
      <CardHeader className="px-3">
        <CardTitle className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-x-3 gap-y-1.5 px-3">{children}</CardContent>
    </Card>
  );
}

export function InfoField({
  label,
  value,
  /** Ocupa toda la fila del panel — para texto libre largo (justificación, dirección). */
  full,
}: {
  label: string;
  value: ReactNode;
  full?: boolean;
}) {
  const empty = value === null || value === undefined || value === "";
  return (
    <div className={cn("min-w-0", full && "col-span-full")}>
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={cn("text-xs font-medium", full ? "whitespace-normal" : "truncate")}>
        {empty ? <span className="font-normal text-muted-foreground">—</span> : value}
      </div>
    </div>
  );
}
