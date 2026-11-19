import { forwardRef, createElement } from 'react'
import type { LucideIcon, LucideProps } from 'lucide-react'
import { Puzzle } from 'lucide-react'
import { iconNames, DynamicIcon } from 'lucide-react/dynamic'

const KNOWN = new Set<string>(iconNames)
const made = new Map<string, LucideIcon>()

/** Имя иконки расширения (PascalCase, как в lucide-react) - имя файла lucide: GitBranch → git-branch. */
const kebab = (name: string): string =>
  name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .replace(/([a-zA-Z])(\d)/g, '$1-$2')
    .toLowerCase()

/**
 * Иконка lucide по имени от расширения (ADR 0091): своя картинка расширению не положена, только
 * набор IDE. Иконка грузится своим куском при первом показе; незнакомое имя - пазл.
 */
export const extensionIcon = (name: string | null | undefined): LucideIcon => {
  if (!name) return Puzzle

  const known = made.get(name)

  if (known) return known

  const file = kebab(name)

  if (!KNOWN.has(file)) {
    made.set(name, Puzzle)

    return Puzzle
  }

  const icon = forwardRef<SVGSVGElement, LucideProps>((props, ref) =>
    createElement(DynamicIcon, { ...props, ref, name: file as never }),
  ) as LucideIcon

  icon.displayName = `ExtensionIcon(${name})`
  made.set(name, icon)

  return icon
}
