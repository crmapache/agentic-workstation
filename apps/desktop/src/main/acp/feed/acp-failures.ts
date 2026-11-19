import type { NoticeCode } from '@shared/conversation-feed'

/**
 * Сбой хода агента ACP - строкой ленты своего вида (ADR 0092). Повторов IDE не делает ни в одном
 * случае: отказ Google по условиям повтор только усугубит, кончившаяся квота от повтора не
 * вернётся. Слова - из строк `agy` 1.5.12 и общих кодов Google API: замерить живьём нельзя, отказ
 * по условиям вызывать нарочно незачем.
 */
const TERMS = /TOS_VIOLATION|terms of service/i

const QUOTA =
  /RESOURCE_EXHAUSTED|QUOTA_EXHAUSTED|exhausted your (quota|capacity)|quota (exceeded|exhausted)|\b429\b/i

/** Код строки ленты по тексту сбоя; незнакомое - ошибка CLI как есть. */
export const failureCodeOf = (text: string): NoticeCode =>
  TERMS.test(text) ? 'terms-blocked' : QUOTA.test(text) ? 'quota-exhausted' : 'cli-error'
