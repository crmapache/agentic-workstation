import type { ConversationFeed } from '@shared/claude-feed'
import type { ScenarioRun } from '@shared/scenario-runs'
import type { RunPlace } from '@shared/ipc/scenarios.contract'

import type { ConversationSpeaker } from '../../../state/conversation-log.context'

export type ScenarioStepLogProps = {
  place: RunPlace
  run: ScenarioRun
  /** Чей журнал: ключ шага или HEAD_LOG - разговор главного потока. */
  logKey: string
}

export type PlainLogProps = {
  feed: ConversationFeed
  speaker: ConversationSpeaker
  onLoadEarlier: () => void
}
