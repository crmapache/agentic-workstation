import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { ProviderModel } from '@shared/providers'
import type { Scenario, ScenarioCode } from '@shared/scenarios'

import { blankStage, blankScenario } from '../scenarios-blank.utils'
import type { EditorPlace } from '../scenarios-editor.utils'
import { isDirty, livePlace, savedTwin, withoutStage } from '../scenarios-editor.utils'
import { providerModels, defaultProvider } from '../scenarios-providers.utils'
import { useScenariosStore } from '../scenarios.store'
import { invoke } from '../../../lib/ipc'
import { useProviders, useScenarioShelves } from '../../../state/scenarios.queries'
import { FIRST_PLACE } from './EditorModal.constants'
import type { EditorModalProps } from './EditorModal.types'

/**
 * Модели для MODEL - из описания провайдера (providers:list; новый каталог и свои модели
 * человека главный процесс присылает событием providers:changed). Провайдер - тот, кого окно
 * запуска предложит первым: в файле сценария провайдера нет, модель карточки - его строка.
 */
export const useProviderModels = (): readonly ProviderModel[] =>
  providerModels(defaultProvider(useProviders().data ?? []))

/**
 * Черновик редактора живёт в сторе вида - в самом запросе окна: окно размонтируется от взгляда
 * на соседний вид середины, а наполовину написанный сценарий пропал бы. Каждая правка - от того,
 * что лежит в сторе в эту секунду, а не от снимка рендера: две правки за такт не теряют одну.
 * Сохраняет главный процесс; отказ оставляет окно открытым со своей причиной.
 */
export const useEditorDraft = ({ project, request }: EditorModalProps) => {
  const { t } = useTranslation()
  const open = useScenariosStore((store) => store.open)
  const close = useScenariosStore((store) => store.close)
  const shelves = useScenarioShelves(project.id).data
  // Пустой «соберу сам» - один на окно: id его этапа и карточки не должны меняться на рендер.
  const [blank] = useState(() =>
    blankScenario('', t('scenarios.editor.stage.newTitle', { number: 1 }), request.scope),
  )
  const [place, setPlace] = useState<EditorPlace>(FIRST_PLACE)
  const [saving, setSaving] = useState(false)
  const [refusal, setRefusal] = useState<ScenarioCode | null>(null)
  const [asking, setAsking] = useState(false)
  const draft = request.scenario ?? blank
  const saved = shelves?.scenarios ?? []

  const current = (): Scenario => {
    const modal = useScenariosStore.getState().modal

    return modal?.kind === 'editor' ? (modal.scenario ?? blank) : draft
  }

  const change = (next: (one: Scenario) => Scenario) => {
    const updated = next(current())

    open({ kind: 'editor', scenario: updated, scope: updated.scope })
  }

  const addStage = () => {
    const stage = blankStage(
      t('scenarios.editor.stage.newTitle', { number: current().stages.length + 1 }),
    )

    change((one) => ({ ...one, stages: [...one.stages, stage] }))
    setPlace({ part: 'stage', stageId: stage.id })
  }

  const removeStage = (stageId: string) => {
    change((one) => withoutStage(one, stageId))
    setPlace(FIRST_PLACE)
  }

  // Закрывает только своё окно: ответ, пришедший после того, как открыли другое, его не тронет.
  const closeEditor = () => {
    if (useScenariosStore.getState().modal?.kind === 'editor') close()
  }

  const save = async () => {
    const scenario = current()

    if (saving) return

    setSaving(true)
    setRefusal(null)

    try {
      const outcome = await invoke('scenarios:save', {
        projectId: project.id,
        scenario,
        scope: scenario.scope,
      })

      if (outcome.ok) closeEditor()
      else setRefusal(outcome.code)
    } catch {
      setRefusal('scenarioNotWritten')
    } finally {
      setSaving(false)
    }
  }

  // Закрыть - крестик, Esc, щелчок мимо, Cancel: что-то правлено - сначала вопрос.
  const leave = () => (isDirty(current(), saved) ? setAsking(true) : close())

  return {
    draft,
    at: livePlace(draft, place),
    fresh: savedTwin(draft, saved) === null,
    canShare: shelves?.canShare ?? true,
    saving,
    refusal,
    asking,
    change,
    place: setPlace,
    addStage,
    removeStage,
    save: () => void save(),
    leave,
    discard: () => {
      setAsking(false)
      closeEditor()
    },
    stay: () => setAsking(false),
  }
}
