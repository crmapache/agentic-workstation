import type { Conversation } from '@shared/claude'
import type {
  FeedItem,
  ToolFeedItem,
  TurnFeedItem,
  UserFeedItem,
  LimitFeedItem,
  RetryFeedItem,
  ShellFeedItem,
  NoticeFeedItem,
  CompactFeedItem,
  ThinkingFeedItem,
  AssistantFeedItem,
  ModelSwitchFeedItem,
} from '@shared/claude-feed'
import type { ToolsResult } from '@shared/claude-tools'
import type { SoundEvent } from '@shared/sounds'
import type { Project } from '@shared/workspace'

import type { ClosableTabCall } from '@agentic-workstation/ui/ClosableTab.types'
import type { RingMeterTone } from '@agentic-workstation/ui/RingMeter.types'
import type { TooltipDetails } from '@agentic-workstation/ui/Tooltip.types'

export type ToolKind = 'hidden' | 'plain' | 'edit' | 'agent' | 'plan' | 'question'

/** Строка ленты для отрисовки: элемент как есть или группа подряд идущих вызовов. */
export type FeedRow =
  | { kind: 'user'; id: string; item: UserFeedItem }
  | { kind: 'assistant'; id: string; item: AssistantFeedItem }
  /** Мысли одной пачки работы - одной карточкой THINK. */
  | { kind: 'think'; id: string; items: ThinkingFeedItem[] }
  | { kind: 'tools'; id: string; items: ToolFeedItem[] }
  | { kind: 'compact'; id: string; item: CompactFeedItem }
  | { kind: 'retry'; id: string; item: RetryFeedItem }
  | { kind: 'model'; id: string; item: ModelSwitchFeedItem }
  | { kind: 'limit'; id: string; item: LimitFeedItem }
  | { kind: 'edit'; id: string; item: ToolFeedItem }
  | { kind: 'agent'; id: string; item: ToolFeedItem; children: FeedItem[] }
  | { kind: 'plan'; id: string; item: ToolFeedItem }
  | { kind: 'question'; id: string; item: ToolFeedItem }
  | { kind: 'turn'; id: string; item: TurnFeedItem }
  | { kind: 'notice'; id: string; item: NoticeFeedItem }
  | { kind: 'shell'; id: string; item: ShellFeedItem }

/** Экран из списка Settings бокового меню. */
export type SettingsScreen =
  | 'calmColors'
  | 'meters'
  | 'newChat'
  | 'newChatModel'
  | 'newChatEffort'
  | 'newChatMode'
  | 'shareEditor'
  | 'pasteCollapse'
  | 'claudeConfig'
  | 'customModels'

/**
 * Экран бокового меню панели (как в ACC): корень со списком и по экрану за каждым
 * пунктом. Шаг назад ведёт к родителю (MENU_PARENT), а не сразу к корню.
 */
export type MenuScreen = 'menu' | 'history' | 'plugins' | 'accounts' | 'settings' | SettingsScreen

/** Что получает каждый экран бокового меню: проект панели и выбранный разговор. */
export type MenuScreenProps = { project: Project; conversation: Conversation | null }

/** Боковое меню: открыто ли, какой экран и пришли ли на него шагом назад. */
export type MenuState = { open: boolean; screen: MenuScreen; back: boolean }

/**
 * Вкладка позвала человека: чем, каким цветом светиться и когда (новый зов той же вкладки -
 * тоже новость: полоса просыпается). Повод - для слов в подсказке вкладки проекта.
 */
export type TabCall = { reason: SoundEvent; tone: ClosableTabCall; at: number }

/** Сообщение, к которому откатываются: разговор и имя строки. */
export type RewindTarget = { conversationId: string; messageId: string }

/** Итог действия на экране настроек: тон и текст плашки под шапкой; null - плашки нет. */
export type ScreenNoticeValue = { tone: 'info' | 'success' | 'danger'; text: string } | null

/**
 * Действие экрана инструментов (плагины, /config): запуск, как его назвать - над чем оно и
 * что сказать при успехе, - и куда положить список, который пришёл вместе с итогом.
 */
export type ToolsAction<Input, Outcome extends { result: ToolsResult }> = {
  run: (input: Input) => Promise<Outcome>
  describe: (input: Input) => { target: string; success: string }
  apply: (outcome: Outcome) => void
}

/**
 * Кольцо окна лимита: доля, бледная дуга темпа, тон, подпись («5-hour») и подсказка
 * словами - с процентом, сбросом и темпом.
 */
export type UsageRing = {
  key: string
  label: string
  value: number
  pace: number | null
  tone: RingMeterTone
  /** Окно упёрлось, работа идёт на доплате: кольцо горит, цифры нет. */
  burning: boolean
  /** Всё о кольце одной строкой - имя для скринридера. */
  hint: string
  /** То же справкой в подсказке: процент, сброс, темп, заметки строками. */
  details: TooltipDetails
}
