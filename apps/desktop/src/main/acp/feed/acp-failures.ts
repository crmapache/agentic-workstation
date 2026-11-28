import type { NoticeCode } from '@shared/conversation-feed'

import type { AcpAgent } from '../acp-agent'

/**
 * Сбой хода агента ACP - строкой ленты своего вида (ADR 0092). Повторов IDE не делает ни в одном
 * случае: отказ Google по условиям повтор только усугубит, кончившаяся квота от повтора не
 * вернётся. Слова - из строк `agy` 1.5.12 и общих кодов Google API: замерить живьём нельзя, отказ
 * по условиям вызывать нарочно незачем. Kimi Code 2.7 о кончившейся подписке пишет «You've reached
 * your 5-hour usage limit» (журнал сессии, kimi-turn-failure.ts).
 */
const TERMS = /TOS_VIOLATION|terms of service/i

const QUOTA =
  /RESOURCE_EXHAUSTED|QUOTA_EXHAUSTED|exhausted your (quota|capacity)|quota (exceeded|exhausted)|usage limit|\b429\b/i

/** Код строки ленты по тексту сбоя; незнакомое - ошибка CLI как есть. */
export const failureCodeOf = (text: string): NoticeCode =>
  TERMS.test(text) ? 'terms-blocked' : QUOTA.test(text) ? 'quota-exhausted' : 'cli-error'

/**
 * Сбой, который агент спрятал за обычным концом хода (Kimi: кончился лимит подписки - `end_turn`
 * без слов), - из его журнала (`AcpAgent.turnFailure`): иначе панель показала бы пустой ход,
 * очередь ушла бы в тот же отказ, а сценарий принял бы молчание за ответ. Остановленный ход - не
 * сбой; журнал не прочитался - ход кончился как кончился. sentAt - когда ход отправлен (мс).
 */
export const hiddenFailure = async (
  agent: Pick<AcpAgent, 'tag' | 'turnFailure'>,
  stopReason: string,
  sessionId: string,
  sentAt: number,
): Promise<string | null> => {
  if (stopReason !== 'end_turn' || !agent.turnFailure || !sessionId) return null

  return agent.turnFailure(sessionId, sentAt).catch((error: unknown) => {
    console.warn(`[${agent.tag}] журнал хода не прочитан:`, error)

    return null
  })
}
