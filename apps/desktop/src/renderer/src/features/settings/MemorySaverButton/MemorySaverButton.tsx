import { Leaf, TriangleAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IconButton } from '@agentic-workstation/ui/IconButton'

import { useMemorySaver, useChangeMemorySaver } from '../../../state/memory-saver.queries'
import { memorySaverAction } from '../../../state/memory-saver.utils'

/**
 * Экономия памяти рядом с mute: заливка только после выхода процесса, сбой виден значком. После
 * сбоя остановки нажатие повторяет тот же выбор, а не меняет режим.
 */
export const MemorySaverButton = () => {
  const { t } = useTranslation()
  const query = useMemorySaver()
  const change = useChangeMemorySaver()
  const state = query.data
  const busy = state?.changing === true || change.isPending
  const failure = state?.definitions.failure
  const failed = query.isError || change.isError || (failure !== null && failure !== undefined)
  const unsaved = state?.saved === false && !busy
  const label = !state
    ? query.isError
      ? t('memorySaver.unavailable')
      : t('memorySaver.loading')
    : busy
      ? t('memorySaver.changing')
      : failed
        ? t(`memorySaver.errors.${failure ?? 'connection'}`)
        : unsaved
          ? t(state.enabled ? 'memorySaver.unsaved.on' : 'memorySaver.unsaved.off')
          : state.enabled
            ? t('memorySaver.on')
            : t('memorySaver.off')

  const handleClick = () => {
    if (!state) void query.refetch()
    else change.mutate(memorySaverAction(state, change.isError ? change.variables : undefined))
  }

  return (
    <IconButton
      icon={failed || unsaved ? TriangleAlert : Leaf}
      label={label}
      size="sm"
      variant={failed ? 'danger' : 'ghost'}
      active={state?.enabled === true && state.definitions.phase === 'idle' && !busy}
      aria-busy={busy}
      aria-disabled={!state && !query.isError}
      data-memory-saver={state?.enabled ? 'on' : 'off'}
      tooltipPlacement="top"
      onClick={handleClick}
    />
  )
}
