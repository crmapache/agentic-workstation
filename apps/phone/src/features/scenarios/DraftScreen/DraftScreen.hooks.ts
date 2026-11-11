import { useRef, useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import type {
  DraftWire,
  SavedDraftWire,
} from '@agentic-workstation/remote-protocol/scenario-wire-types'

import { useClient } from '../../../lib/client'
import { newId } from '../../../lib/ids'
import type { RouteOf } from '../../../lib/route.types'
import { useRouter } from '../../../lib/router.store'
import type { ShelfScope } from '../../../lib/routes'
import { CommandError } from '../../../state/command-error'
import { useCommand } from '../../../state/commands.hooks'
import { failureText } from '../../../state/commands.utils'
import { queryKeys } from '../../../state/query-keys'
import type { DraftPhase } from './DraftScreen.types'

/**
 * Черновик сценария моделью: описание и полка - модель пишет до десяти минут (команда ждёт
 * сама), потом сценарий на чтение: сохранить ровно то, что она написала, или выбросить. Ушли с
 * экрана, пока она пишет, - черновик отменяется: его некому будет сохранить.
 */
export const useDraftScreen = (route: RouteOf<'draft'>) => {
  const { t } = useTranslation()
  const { agentId, projectKey } = route
  const client = useClient()
  const navigate = useRouter((state) => state.navigate)
  const cancel = useCommand(agentId, 'scenarios.cancelDraft', { quiet: true })
  const save = useCommand(agentId, 'scenarios.saveDraft', {
    invalidates: queryKeys.shelves(agentId, projectKey),
  })
  const [description, setDescription] = useState('')
  const [scope, setScope] = useState<ShelfScope>('project')
  const [phase, setPhase] = useState<DraftPhase>({ kind: 'form', failure: null })
  const writing = useRef<string | null>(null)

  useEffect(
    () => () => {
      if (writing.current)
        void client.command(agentId, 'scenarios.cancelDraft', { draftId: writing.current })
    },
    [client, agentId],
  )

  const handleWrite = async () => {
    const text = description.trim()

    if (!text || phase.kind === 'writing') return

    const draftId = newId()

    writing.current = draftId
    setPhase({ kind: 'writing', draftId, startedAt: Date.now() })

    const outcome = await client.command(agentId, 'scenarios.draft', {
      projectKey,
      draftId,
      description: text,
      scope,
    })

    writing.current = null

    if (!outcome.ok) {
      return setPhase({ kind: 'form', failure: failureText(t, new CommandError(outcome)) })
    }

    const draft = outcome.data as DraftWire

    setPhase(
      draft.ok
        ? { kind: 'ready', draftId, scenario: draft.scenario }
        : {
            kind: 'form',
            failure: draft.cancelled
              ? t('draft.cancelled')
              : t('draft.failed', { error: draft.error }),
          },
    )
  }

  const handleCancel = () => {
    if (phase.kind === 'writing') cancel.mutate({ draftId: phase.draftId })
  }

  const handleDiscard = () => {
    if (phase.kind === 'ready') cancel.mutate({ draftId: phase.draftId })

    setPhase({ kind: 'form', failure: null })
  }

  const handleSave = async () => {
    if (phase.kind !== 'ready') return

    const saved = (await save
      .mutateAsync({ projectKey, draftId: phase.draftId })
      .catch(() => null)) as SavedDraftWire | null

    if (saved) {
      navigate(
        {
          name: 'scenario',
          agentId,
          projectKey,
          scope: saved.scope,
          scenarioId: saved.scenarioId,
        },
        { replace: true },
      )
    }
  }

  return {
    description,
    setDescription,
    scope,
    setScope,
    phase,
    isCancelling: cancel.isPending,
    isSaving: save.isPending,
    handleWrite,
    handleCancel,
    handleDiscard,
    handleSave,
  }
}
