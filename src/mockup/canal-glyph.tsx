// Glifo de un canal: su logo de marca si `CANAL_META[canal].logo` está seteado, si no el ícono
// lucide. Un solo lugar para resolverlo → card, tablas y leyendas quedan consistentes y cambiar al
// logo real (ej. eVenado) es setear `logo` en mock-data.
import { CANAL_META, type CanalId } from './mock-data'

export function CanalGlyph({
  canal,
  size = 14,
  className,
}: {
  canal: CanalId
  size?: number
  className?: string
}) {
  const meta = CANAL_META[canal]
  if (meta.logo) {
    return (
      <img
        src={meta.logo}
        alt={meta.label}
        width={size}
        height={size}
        className={className}
        style={{ objectFit: 'contain' }}
      />
    )
  }
  const Icon = meta.icon
  return <Icon size={size} className={className} />
}
