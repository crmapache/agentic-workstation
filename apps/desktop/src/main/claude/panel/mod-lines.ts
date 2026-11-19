import type { ModPane, ConversationMods } from '@shared/panel-extras'

import type { CliMessage } from '../cli/cli-messages'
import { numberField, stringField, recordsField } from '../cli/cli-messages'
import {
  MOD_LOG,
  MOD_PANES,
  MOD_TOAST,
  MOD_PREFIX,
  MOD_STATUS,
  MOD_TOAST_MS,
  MOD_QUESTION_PREFIX,
} from './panel.constants'

/**
 * Что CLI говорит от имени мода (2.1.287+, замер ACC на 2.1.293): строки `system` с
 * подтипом `ui_`. Без мода таких строк нет, поэтому разговор без мода сюда не доходит.
 * Статус и окна - состояние (последнее значение), всплывашка - только живьём, строка
 * лога - в ленту, перерисовка (`ui_invalidate`, до 10 раз в секунду) и прочее для
 * поверхности, которую панель не подключала, - выбрасываются.
 */

/** Что строка мода дала: новое состояние модов (undefined - ничего не стоит) и строку лога. */
export type ModFold = {
  mods: ConversationMods | undefined
  log: { plugin: string; text: string } | null
}

const NOTHING: ConversationMods = { status: {}, panes: [], toast: null }

/** Состояние, в котором ничего не стоит, - не состояние: у разговора без модов его нет. */
const settled = (mods: ConversationMods): ConversationMods | undefined =>
  Object.keys(mods.status).length === 0 && mods.panes.length === 0 && mods.toast === null
    ? undefined
    : mods

const panesOf = (message: CliMessage): ModPane[] =>
  recordsField(message, 'panes')
    .map((pane) => ({
      id: stringField(pane, 'id'),
      title: stringField(pane, 'title'),
      plugin: stringField(pane, 'plugin'),
    }))
    .filter((pane) => pane.id.length > 0)

/** Строка мода - по верхнему уровню: слово в тексте агента ею не станет. */
const isModLine = (message: CliMessage): boolean =>
  message.type === 'system' &&
  typeof message.subtype === 'string' &&
  message.subtype.startsWith(MOD_PREFIX)

/**
 * Строка мода поверх того, что моды держат сейчас; null - строка не мода. now - часы для
 * срока всплывашки.
 */
export const foldModLine = (
  current: ConversationMods | undefined,
  message: CliMessage,
  now: number,
): ModFold | null => {
  if (!isModLine(message)) return null

  const mods = current ?? NOTHING
  const plugin = stringField(message, 'plugin')
  const text = stringField(message, 'text').trim()

  switch (message.subtype) {
    case MOD_STATUS: {
      const { [plugin]: _previous, ...rest } = mods.status

      return {
        mods: settled({ ...mods, status: text ? { ...rest, [plugin]: text } : rest }),
        log: null,
      }
    }

    case MOD_PANES:
      return { mods: settled({ ...mods, panes: panesOf(message) }), log: null }

    case MOD_TOAST: {
      const lasts = numberField(message, 'timeout_ms')
      const toast = text ? { plugin, text, until: now + (lasts > 0 ? lasts : MOD_TOAST_MS) } : null

      return { mods: toast ? { ...mods, toast } : current, log: null }
    }

    case MOD_LOG:
      return { mods: current, log: text ? { plugin, text } : null }

    default:
      return { mods: current, log: null }
  }
}

/** Всплывашка отжила свой срок: убрать её (и всё состояние, если больше ничего не стоит). */
export const withoutToast = (
  mods: ConversationMods | undefined,
  now: number,
): ConversationMods | undefined =>
  mods?.toast && mods.toast.until <= now ? settled({ ...mods, toast: null }) : mods

/**
 * Вопрос мода ($.ui.ask): номер его делает CLI, вызова с таким номером в разговоре нет -
 * карточку рисуют из запроса, а не из вызова.
 */
export const isModQuestion = (toolUseId: string): boolean =>
  toolUseId.startsWith(MOD_QUESTION_PREFIX)
