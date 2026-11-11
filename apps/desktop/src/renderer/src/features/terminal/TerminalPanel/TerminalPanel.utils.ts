import type { TFunction } from 'i18next'

import type { TerminalSession } from '@shared/terminal'

/** Выбранная вкладка проекта: запомненная, если жива, иначе последняя. */
export const activeSessionId = (
  sessions: readonly TerminalSession[],
  picked: string | undefined,
): string | null =>
  sessions.find((session) => session.id === picked)?.id ?? sessions.at(-1)?.id ?? null

/** Имя вкладки, как в WebStorm: первая - «Local», дальше «Local (2)». */
export const tabTitle = (ordinal: number, t: TFunction): string =>
  ordinal === 1 ? t('terminal.local') : t('terminal.localNumbered', { number: ordinal })
