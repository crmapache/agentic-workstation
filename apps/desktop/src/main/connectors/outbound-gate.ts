import type { ToolAccess } from '@shared/connectors'
import type { GoalOutbound } from '@shared/goals'

import { isToolEnabled } from './tool-access'

/** Вызов отправки людям, который поручение просит подтвердить: где, что и с чем. */
export type OutboundCall = {
  server: string
  tool: string
  /** Коннектор так, как его назвал человек: «Gmail · Work». */
  title: string
  args: Record<string, unknown>
}

/**
 * Правило отправки людям у поручений (ADR 0080). Ставят задания, когда поднимутся (коннекторы
 * поднимаются раньше), - до тех пор все разговоры обычные: отправка такая, как настроил человек.
 */
export type OutboundGate = {
  /** Правило разговора; null - не поручение. */
  outboundOf: (conversationId: string) => GoalOutbound | null
  /** Один вызов отправки - кнопкой человека в уведомлениях; нет ответа или отказ - false. */
  confirm: (conversationId: string, call: OutboundCall, signal: AbortSignal) => Promise<boolean>
}

/**
 * Открыт ли инструмент разговору. Обычный разговор - как настроил человек (отправка выключена,
 * пока он не включит). Поручение со своим правилом: drafts - отправки нет вовсе; confirm и free -
 * отправка открыта (каждую по confirm подтверждает человек), кроме выключенной им поштучно.
 */
export const toolOpenFor = (
  access: ToolAccess,
  override: boolean | undefined,
  outbound: GoalOutbound | null,
): boolean => {
  if (!outbound || access !== 'outbound') return isToolEnabled(access, override)

  return outbound === 'drafts' ? false : (override ?? true)
}

/** Ответ модели на отправку у поручения «только черновики». */
export const DRAFTS_ONLY_TEXT =
  'This goal may not send anything to other people. Prepare a draft and notify the user to send it.'

/** Ответ модели, когда человек не подтвердил отправку. */
export const REFUSED_TEXT =
  'The user did not confirm this message, so it was not sent. Ask them what to change, or try another way.'

/** Строка пояснения коннектора для поручения с открытой отправкой. */
export const CONFIRM_NOTE =
  'Every message to other people waits for the user to confirm it in Agentic Workstation before it goes.'
