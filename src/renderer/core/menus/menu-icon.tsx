import { DynamicIcon, type IconName } from 'lucide-react/dynamic'
import type { LucideProps } from 'lucide-react'

// El manifest declara nombres lucide en PascalCase ("Sparkles"); DynamicIcon usa kebab-case.
// Inserta guion en dos fronteras: camelCase ("ShoppingCart"→"shopping-cart") Y letra→dígito
// ("BarChart3"→"bar-chart-3", "Building2"→"building-2"), que lucide separa con guion.
export function toKebabCase(name: string): IconName {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([a-zA-Z])([0-9])/g, '$1-$2')
    .toLowerCase() as IconName
}

/**
 * Ícono declarado por nombre en una contribución (`contributes.commands[].icon`).
 * DynamicIcon importa cada ícono en su propio chunk — el set completo de lucide
 * NO entra al bundle inicial. Nombre desconocido → no renderiza nada.
 */
export function MenuIcon({ name, ...props }: { name: string } & LucideProps) {
  return <DynamicIcon name={toKebabCase(name)} fallback={() => null} {...props} />
}
