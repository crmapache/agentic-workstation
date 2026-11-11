import type { Ref } from 'react'

import type { RunStep, RunLimit, RunQuestion, ScenarioRun } from '@shared/scenario-runs'
import type { RunPlace } from '@shared/ipc/scenarios.contract'

import type { ScenariosModal } from '../scenarios.types'
import type { ScenariosProject } from '../ScenariosView/ScenariosView.types'

export type RunModalProps = {
  project: ScenariosProject
  request: Extract<ScenariosModal, { kind: 'run' }>
}

export type RunActionsProps = {
  place: RunPlace
  run: ScenarioRun
  /** Открытый журнал (шаг или главный поток); null - таймлайн. */
  logKey: string | null
  onMainThread: () => void
  onBack: () => void
  /** Разговор головы ушёл в панель провайдера - окно прогона больше не нужно. */
  onClose: () => void
}

export type RunPageProps = {
  /** Корень страницы: по нему окно встаёт на строку таймлайна. */
  ref?: Ref<HTMLDivElement> | undefined
  place: RunPlace
  run: ScenarioRun
  onOpenLog: (step: RunStep) => void
}

export type RunFactsProps = { run: ScenarioRun; now: number }

export type LimitStripProps = { limit: RunLimit }

export type EndBannerProps = { run: ScenarioRun }

export type RunQuestionCardProps = { place: RunPlace; runId: string; question: RunQuestion }

export type StopDialogProps = {
  /** Что останавливают: имя сценария и очередь - два прогона одного сценария различаются ею. */
  subject: string
  onStop: () => void
  onClose: () => void
}

/** Показание в строке цифр прогона: подпись и значение. */
export type RunReading = { key: string; label: string; value: string }

/**
 * Где открывается таймлайн: present - на строке, где прогон сейчас; top - наверху то, что
 * читать первым (вопрос, лимит, ошибка, итог законченного прогона).
 */
export type RunOpening = 'present' | 'top'
