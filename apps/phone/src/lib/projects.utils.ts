import type {
  InventoryProject,
  ConversationStatus,
  ConversationSummary,
} from '@agentic-workstation/remote-protocol/wire-types'
import type { AvatarTone } from '@agentic-workstation/ui/Avatar.types'

const TONES = 6

/** Цвет значка проекта по имени: один проект - один цвет на всех экранах. */
export const avatarToneOf = (name: string): AvatarTone => {
  let hash = 0

  for (const char of name) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0

  return (hash % TONES) as AvatarTone
}

/** Одна-две буквы значка: первые буквы двух слов имени, иначе две первые. */
export const initialsOf = (name: string): string => {
  const words = name.split(/[\s._-]+/).filter(Boolean)
  const letters =
    words.length > 1 ? `${words[0]?.[0] ?? ''}${words[1]?.[0] ?? ''}` : name.slice(0, 2)

  return letters.toUpperCase() || '?'
}

/**
 * Разговоры проекта, которые видит телефон: без пустых вкладок «New chat» (IDE помечает их
 * blank). Новый разговор начинают кнопкой в низу экрана, а пустая вкладка в списке - лишняя
 * строка (просьба владельца).
 */
export const startedConversations = (project: InventoryProject): ConversationSummary[] =>
  project.conversations.filter((conversation) => !conversation.blank)

/** Сколько разговоров проекта в каждом состоянии - строка под именем проекта. */
export const conversationCounts = (
  project: InventoryProject,
): Record<ConversationStatus, number> => {
  const counts: Record<ConversationStatus, number> = {
    idle: 0,
    running: 0,
    'waiting-for-you': 0,
  }

  for (const conversation of startedConversations(project)) counts[conversation.status] += 1

  return counts
}

/** Ждёт ли проект человека: разговор с вопросом или прогон сценария с вопросом. */
export const projectNeedsYou = (project: InventoryProject): boolean =>
  project.queues.asking > 0 ||
  project.conversations.some((conversation) => conversation.status === 'waiting-for-you')

/** Идёт ли ход разговора проекта - работа, за которой следят. */
const chatWorks = (project: InventoryProject): boolean =>
  project.conversations.some((conversation) => conversation.status === 'running')

/**
 * Сколько фоновой работы идёт само: прогоны сценариев и заданий. IDE старше не шлёт working
 * сценариев - тогда идущие без вопроса, хоть в них и попадают пауза и упор в лимит; заданий не
 * шлёт вовсе.
 */
const backgroundWorking = (project: InventoryProject): number =>
  (project.queues.working ?? project.queues.running - project.queues.asking) +
  (project.tasks?.working ?? 0)

/**
 * Работает ли в проекте что-то само: разговор с идущим ходом или прогон сценария или задания,
 * который идёт и ни о чём не спрашивает, - как знак работы на вкладке проекта в IDE (ADR 0071).
 * Ждущее человека - не работа: о нём говорит метка «Needs you».
 */
export const projectWorks = (project: InventoryProject): boolean =>
  backgroundWorking(project) > 0 || chatWorks(project)

/**
 * Работает только фон - прогоны сценариев и заданий, без хода разговора: знак работы - кольцо из
 * шагов, а не дуга, как на вкладке проекта в IDE (ADR 0097).
 */
export const projectWorksInBackground = (project: InventoryProject): boolean =>
  backgroundWorking(project) > 0 && !chatWorks(project)
