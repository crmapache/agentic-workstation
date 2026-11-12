import type { ParseKeys } from 'i18next'

import type { ConversationSpeaker } from '../../../state/conversation-log.context'

/** Подпись сообщений со стороны человека - по тому, кто на этом месте пишет в журнале. */
export const SPEAKER_KEYS: Record<ConversationSpeaker, ParseKeys> = {
  main: 'claudeCode.conversationLog.speakers.main',
  scenario: 'claudeCode.conversationLog.speakers.scenario',
  person: 'claudeCode.message.you',
}
