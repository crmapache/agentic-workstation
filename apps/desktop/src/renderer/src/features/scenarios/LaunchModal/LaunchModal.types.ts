import type { Scenario, ScenarioScope } from '@shared/scenarios'
import type { ScenariosInvokeContract } from '@shared/ipc/scenarios.contract'

import type { ScenariosModal } from '../scenarios.types'
import type { ScenariosProject } from '../ScenariosView/ScenariosView.types'
import type { useLaunchForm } from './LaunchModal.hooks'

export type LaunchRequest = Extract<ScenariosModal, { kind: 'launch' }>

/** Что окно отдаёт главному процессу на запуск. */
export type StartRequest = ScenariosInvokeContract['scenarios:start']['request']

export type LaunchModalProps = { project: ScenariosProject; request: LaunchRequest }

/** Выбранный сценарий: id стабилен, полка различает двойников с одним id. */
export type ScenarioPick = { id: string; scope: ScenarioScope }

/** Куда поставить: новая очередь или открытая очередь этого проекта. */
export type LaunchWhere = { kind: 'new' } | { kind: 'queue'; queueId: string }

/** Отказ запуска словом окна: код главного процесса или «что-то пошло не так». */
export type LaunchFailure = { code: string; detail: string }

export type LaunchForm = ReturnType<typeof useLaunchForm>

/** Часть формы запуска: читает и меняет общее состояние формы. */
export type LaunchPartProps = { form: LaunchForm }

export type ScenarioOptionsProps = LaunchPartProps & { title: string; scenarios: Scenario[] }

export type LaunchFailureLineProps = { failure: LaunchFailure }
