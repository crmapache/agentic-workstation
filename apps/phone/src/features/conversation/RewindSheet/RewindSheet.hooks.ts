import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useQuery } from '@tanstack/react-query'

import type {
  RewindOutcomeWire,
  RewindPreviewWire,
} from '@agentic-workstation/remote-protocol/conversation-wire-types'

import { useClient } from '../../../lib/client'
import { commandData } from '../../../state/command-data'
import { useCommand } from '../../../state/commands.hooks'
import { useDraftsStore } from '../../../state/drafts.store'
import { queryKeys } from '../../../state/query-keys'
import { useToastStore } from '../../../state/toast.store'
import type { RewindScope, RewindSheetProps } from './RewindSheet.types'
import { rewindScopes, effectiveScope } from './RewindSheet.utils'

/**
 * Откат к сообщению: сначала IDE говорит, какие файлы вернутся (ничего не меняя), потом сам
 * откат. Отрезанное сообщение возвращается в поле, как в IDE; что не вышло - уведомлением.
 */
export const useRewindSheet = ({
  agentId,
  conversationId,
  messageId,
  draftKey,
  running,
  onClose,
}: RewindSheetProps) => {
  const client = useClient()
  const { t } = useTranslation()
  const show = useToastStore((state) => state.show)
  const setDraft = useDraftsStore((state) => state.setDraft)
  const rewind = useCommand(agentId, 'conversation.rewind')
  const [chosen, setChosen] = useState<RewindScope | null>(null)
  const preview = useQuery({
    queryKey: queryKeys.rewindPreview(agentId, conversationId, messageId),
    queryFn: async (): Promise<RewindPreviewWire> =>
      (await commandData(client, agentId, 'conversation.rewindPreview', {
        conversationId,
        messageId,
      })) as RewindPreviewWire,
    // Файлы меняются, пока разговор идёт: открыли окно снова - спросить снова.
    staleTime: 0,
    gcTime: 0,
  })
  const scopes = rewindScopes(preview.data, running)
  const scope = effectiveScope(chosen, scopes)

  const handleRewind = async () => {
    const outcome = (await rewind
      .mutateAsync({ conversationId, messageId, scope })
      .catch(() => null)) as RewindOutcomeWire | null

    if (!outcome) return
    if (!outcome.rewound) {
      show(
        t('rewind.notDone'),
        t(`rewind.refused.${outcome.reason}`, {
          detail: outcome.detail,
          defaultValue: t('rewind.refused.other', { detail: outcome.detail || outcome.reason }),
        }),
      )

      return onClose()
    }

    if (outcome.prefill) setDraft(draftKey, outcome.prefill)
    if (outcome.filesFailed !== null) show(t('rewind.filesFailed'), outcome.filesFailed)
    else show(t('rewind.done'), undefined, 'neutral')

    onClose()
  }

  return {
    preview,
    scopes,
    scope,
    setScope: setChosen,
    isRewinding: rewind.isPending,
    handleRewind,
  }
}
