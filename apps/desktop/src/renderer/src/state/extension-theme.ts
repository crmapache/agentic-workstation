/** Токены, которые сейчас поставила тема расширений: их снимают, когда тема уходит. */
let applied: Record<string, string> = {}
const appliedListeners = new Set<() => void>()

/**
 * Тема от расширений (ADR 0091): токены дизайн-системы на корне документа поверх tokens.css.
 * Главный процесс уже проверил имена и значения; здесь - только поставить новое и снять
 * ушедшее. Monaco и терминал цвета из CSS сами не перечитывают - им onExtensionThemeApplied.
 */
export const applyExtensionTheme = (tokens: Record<string, string>): void => {
  const root = document.documentElement.style
  let changed = false

  for (const name of Object.keys(applied)) {
    if (!(name in tokens)) {
      root.removeProperty(name)
      changed = true
    }
  }

  for (const [name, value] of Object.entries(tokens)) {
    if (applied[name] !== value) {
      root.setProperty(name, value)
      changed = true
    }
  }

  applied = { ...tokens }

  if (changed) appliedListeners.forEach((listener) => listener())
}

/** Тема расширений поменялась и уже стоит на корне: перечитать цвета не из CSS. */
export const onExtensionThemeApplied = (listener: () => void): (() => void) => {
  appliedListeners.add(listener)

  return () => {
    appliedListeners.delete(listener)
  }
}
