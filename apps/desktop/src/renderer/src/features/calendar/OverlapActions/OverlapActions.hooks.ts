import { useTranslation } from 'react-i18next'

import type { ProviderId } from '@shared/providers'

import { useCalendarActions } from '../calendar.actions'
import { invoke } from '../../../lib/ipc'
import { useActionNoticeStore } from '../../../state/action-notice.store'
import { useChatTargets } from '../../../state/chat-targets.hooks'

/**
 * Действия над накладкой: отметить «видел» (перестаёт гореть) или снять отметку, и отдать
 * разбор ИИ - новым чатом выбранного провайдера. Разбор собирает главный процесс (обе встречи,
 * история переносов, правила); в поле он ложится чипом, отправляет человек.
 */
export const useOverlapActions = (overlapKey: string) => {
  const { t } = useTranslation()
  const { markOverlap } = useCalendarActions()
  const notify = useActionNoticeStore((state) => state.show)
  const { targets, hand } = useChatTargets()

  const ask = async (provider: ProviderId) => {
    const brief = await invoke('calendar:overlapBrief', { key: overlapKey })

    if (!brief.ok) {
      notify({ tone: 'danger', title: t('calendar.overlaps.gone') })

      return
    }

    hand?.(provider, { kind: 'overlap', value: overlapKey, text: brief.text })
  }

  return {
    targets,
    canAsk: hand !== null,
    ask: (provider: ProviderId) => void ask(provider),
    mark: (seen: boolean) => void markOverlap(overlapKey, seen),
  }
}
