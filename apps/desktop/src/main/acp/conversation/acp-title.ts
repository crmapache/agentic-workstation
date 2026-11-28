import { OWN_TITLE_MAX } from '@shared/conversation'

import type { ConversationRuntime } from '../../agents/conversation/conversation-runtime'
import { isSlashCommand } from '../../agents/conversation/conversation.utils'
import type { StoredPanel } from '../../agents/panel/panel-state'
import { rankOf, outranks } from '../../agents/tabs/tab-names'
import { acpOf } from './acp-conversation'

/** Короче - не о чем называть: «ок», «+», «дальше». */
const TITLE_MIN_CHARS = 10

/** Одна строка без лишних пробелов: так сравниваются догадка-имя и сообщение. */
const flat = (text: string) => text.replace(/\s+/g, ' ').trim()

/**
 * Что отдать агенту за именем: имя-догадку вкладки (это начало первого сообщения разговора), если
 * оно не начало этого же сообщения, и само сообщение. Команда «/» и короткое разговор не называют
 * - ждём следующего. null - по этому сообщению не назвать.
 */
export const titlePrompts = (guess: string, text: string): string[] | null => {
  const said = flat(text)

  if (isSlashCommand(said) || said.length < TITLE_MIN_CHARS) return null

  const seed = flat(guess).replace(/…$/, '')

  return seed && !said.startsWith(seed) ? [seed, said] : [said]
}

/**
 * Имя вкладки от агента, который сам по ACP его не даёт (`AcpAgent.title`, у Kimi - его же
 * инструмент имён), - сразу после сообщения человека, а не по концу хода: ход бывает и в час.
 * Спрашиваем, пока у вкладки нет имени от модели или человека: не вышло - пробует следующее
 * сообщение. Сообщение от агента IDE (`workstation` и прочие) - такое же сообщение, его тоже
 * называют; служебное (`auto`: отчёт фоновой работы, продолжение после лимита) - нет.
 */
export const askAcpTitle = (runtime: ConversationRuntime, text: string): void => {
  const kit = acpOf(runtime)
  const { title } = kit.host.agent

  if (!title || kit.titleAsking || rankOf(runtime.meta.titleSource) >= rankOf('llm')) return

  const prompts = titlePrompts(
    runtime.meta.titleSource === 'heuristic' ? runtime.meta.title : '',
    text,
  )

  if (!prompts) return

  kit.titleAsking = true
  title(prompts)
    .then((name) => {
      if (name && outranks('llm', runtime.meta.titleSource)) {
        runtime.update({ title: name, titleSource: 'llm' })
      }
    })
    .catch((error: unknown) => console.warn(`[${kit.host.agent.tag}] имя не получено:`, error))
    .finally(() => {
      kit.titleAsking = false
    })
}

/**
 * Вкладки агента с `title`, которые раньше приняли его начало сообщения за имя от модели (Kimi
 * шлёт первые 200 знаков сообщения): такое длиннее любого имени - снова догадка, и следующее
 * сообщение назовёт разговор по-настоящему. Короткое начало от имени не отличить - остаётся.
 */
export const withoutPromptTitles = (stored: StoredPanel): StoredPanel => ({
  ...stored,
  conversations: stored.conversations.map((conversation) =>
    conversation.titleSource === 'llm' && conversation.title.length > OWN_TITLE_MAX
      ? { ...conversation, titleSource: 'heuristic' }
      : conversation,
  ),
})
