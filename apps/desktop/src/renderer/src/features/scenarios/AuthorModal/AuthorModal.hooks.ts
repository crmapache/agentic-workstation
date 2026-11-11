import { useEffect } from 'react'

import type { ScenarioDraftOutcome } from '@shared/scenario-view'
import type { ScenarioScope } from '@shared/scenarios'

import { scopeFor, freshDraftId } from '../scenarios-forms.utils'
import { useScenariosStore } from '../scenarios.store'
import { invoke } from '../../../lib/ipc'
import { useAuthorStore } from './AuthorModal.store'

/** Отказ IPC - тоже ответ, а не вечная полоса «пишет»: его слова встают на место ошибки. */
const askDraft = async (
  request: () => Promise<ScenarioDraftOutcome>,
): Promise<ScenarioDraftOutcome> => {
  try {
    return await request()
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      cancelled: false,
    }
  }
}

const cancelRunning = () => {
  const { drafting, update } = useAuthorStore.getState()

  if (!drafting) return

  void invoke('scenarios:cancelDraft', { draftId: drafting.id })
  update({ drafting: null })
}

/**
 * Новый сценарий (NewScenarioForm в ACC): описание и полка - в сторе формы, черновик модели -
 * номером запроса. Ответ кладётся, только если номер всё ещё тот: отменённый или переспрошенный
 * запрос не должен открыть редактор поверх того, что человек уже делает. Написанное не
 * сохраняется - оно открывается в редакторе, и Save жмёт человек.
 */
export const useScenarioDraft = (projectId: string, canShare: boolean) => {
  const form = useAuthorStore()
  const open = useScenariosStore((store) => store.open)
  const close = useScenariosStore((store) => store.close)
  const scope = scopeFor(form.scope ?? 'project', canShare)

  // Окно закрыли или сменили другим, пока модель пишет, - черновик бросается: открыться ему
  // потом некуда. Окно, ушедшее вместе с видом, остаётся в сторе - и запрос идёт дальше.
  useEffect(
    () => () => {
      if (useScenariosStore.getState().modal?.kind !== 'author') cancelRunning()
    },
    [],
  )

  const write = async () => {
    const { description, drafting, update, reset } = useAuthorStore.getState()
    const text = description.trim()

    if (!text || drafting) return

    const id = freshDraftId()

    update({ drafting: { id, since: Date.now() }, error: '' })

    const outcome = await askDraft(() =>
      invoke('scenarios:draft', { projectId, draftId: id, description: text, scope }),
    )

    if (useAuthorStore.getState().drafting?.id !== id) return

    if (!outcome.ok) {
      update({ drafting: null, error: outcome.cancelled ? '' : outcome.error })

      return
    }

    reset()

    if (useScenariosStore.getState().modal?.kind === 'author') {
      open({ kind: 'editor', scenario: outcome.scenario, scope: outcome.scenario.scope })
    }
  }

  const leave = () => {
    cancelRunning()
    form.update({ error: '' })
    close()
  }

  const byHand = () => {
    form.reset()
    open({ kind: 'editor', scenario: null, scope })
  }

  return {
    form,
    scope,
    write: () => void write(),
    cancel: cancelRunning,
    leave,
    byHand,
    describe: (description: string) => form.update({ description }),
    choose: (chosen: ScenarioScope) => form.update({ scope: chosen }),
  }
}
