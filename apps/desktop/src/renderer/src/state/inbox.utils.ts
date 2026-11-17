import type { InboxItem } from '@shared/inbox'
import type { SoundEvent } from '@shared/sounds'

/**
 * Чем звучит уведомление - звуками IDE (Settings → Sounds), без своего набора: вопрос и
 * разрешение прогона звучат как те же поводы разговора, отчёт - как конец хода, сбой - как
 * поломка, напоминание и сообщение «с вниманием» - как вопрос.
 */
export const soundOfItem = (item: Pick<InboxItem, 'kind' | 'tone'>): SoundEvent => {
  switch (item.kind) {
    case 'question':
    case 'permission':
    case 'plan':
      return item.kind
    case 'failure':
      return 'error'
    case 'reminder':
      return 'question'
    case 'message':
      return item.tone === 'attention' ? 'question' : 'turnDone'
    case 'report':
      return 'turnDone'
  }
}
