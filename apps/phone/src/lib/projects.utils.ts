import type {
  InventoryProject,
  ConversationStatus,
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

/** Сколько разговоров проекта в каждом состоянии - строка под именем проекта. */
export const conversationCounts = (
  project: InventoryProject,
): Record<ConversationStatus, number> => {
  const counts: Record<ConversationStatus, number> = {
    idle: 0,
    running: 0,
    'waiting-for-you': 0,
  }

  for (const conversation of project.conversations) counts[conversation.status] += 1

  return counts
}

/** Ждёт ли проект человека: разговор с вопросом или прогон сценария с вопросом. */
export const projectNeedsYou = (project: InventoryProject): boolean =>
  project.queues.asking > 0 ||
  project.conversations.some((conversation) => conversation.status === 'waiting-for-you')
