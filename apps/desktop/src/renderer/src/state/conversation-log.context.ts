import type { ComponentType } from 'react'
import { useContext, createContext } from 'react'

import type { ConversationFeed } from '@shared/claude-feed'

/**
 * Кто в этой ленте стоит на месте человека: main - главный поток прогона (журнал шага: карточке
 * пишет он), scenario - сам движок сценария (разговор главного потока: ему пишет прогон).
 */
export type ConversationSpeaker = 'main' | 'scenario'

export type ConversationLogProps = {
  feed: ConversationFeed
  /** Папка, где шла сессия (проект или worktree очереди): пути в ленте - от неё. */
  folder: string
  speaker: ConversationSpeaker
  /** Нажали «load earlier»; нет - метки над лентой нет, даже если выше есть ещё. */
  onLoadEarlier?: (() => void) | undefined
}

/** Текст агента в разметке (вердикт, слова главного потока): ссылки и код работают, как в ленте. */
export type ConversationTextProps = { text: string }

/**
 * Как провайдер рисует свой разговор, когда его смотрят не в его панели: лента только для
 * чтения (без поля ввода, отката и форка) и его же разбор Markdown для отдельных слов.
 */
export type ConversationLog = {
  Feed: ComponentType<ConversationLogProps>
  Text: ComponentType<ConversationTextProps>
}

/**
 * Журнал шага сценария - разговор провайдера той же лентой, что в его панели (ADR 0039). Фича
 * сценариев панель провайдера не видит: workbench кладёт сюда её компоненты, фича берёт их
 * через useConversationLog - как действие «открыть файл» (open-file.context.ts).
 */
export const ConversationLogContext = createContext<ConversationLog | null>(null)

/** Компоненты разговора провайдера; null - окно без раскладки (витрина, тест). */
export const useConversationLog = () => useContext(ConversationLogContext)
