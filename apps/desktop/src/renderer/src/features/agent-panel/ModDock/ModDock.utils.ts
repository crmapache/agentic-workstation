import type { ModPane } from '@shared/panel-extras'

/** Окно мода по заголовку, с модом рядом, когда они различаются: «Blast Radius (blast-radius)». */
export const paneName = (pane: ModPane): string => {
  const title = pane.title.trim()
  const plugin = pane.plugin.trim()

  if (!title) return plugin || pane.id

  return plugin && plugin !== title ? `${title} (${plugin})` : title
}
