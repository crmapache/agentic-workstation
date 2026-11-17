import type { ScenarioQueue } from '@shared/scenario-queues'

import type { ScenariosModal } from '../scenarios.types'

export type QueueHoursModalProps = { request: Extract<ScenariosModal, { kind: 'hours' }> }

export type HoursFormProps = { queue: ScenarioQueue }
