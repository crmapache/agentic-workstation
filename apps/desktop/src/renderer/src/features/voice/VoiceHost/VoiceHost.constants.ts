import type { VoiceCallEnd } from '@shared/voice'

type NoticeReason = 'lostLine' | 'silence' | 'keyRejected' | 'deepgram' | 'conversationGone'

/** Концы звонка, о которых сказать в углу окна: не сам положил трубку и не выход из IDE. */
export const ENDED_NOTICES: Partial<Record<VoiceCallEnd, `voice.ended.${NoticeReason}`>> = {
  lostLine: 'voice.ended.lostLine',
  silence: 'voice.ended.silence',
  keyRejected: 'voice.ended.keyRejected',
  deepgram: 'voice.ended.deepgram',
  conversationGone: 'voice.ended.conversationGone',
}
