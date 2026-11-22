import type { RunningTask } from '../Feed/Feed.types'

/** Вид капсулы - как чипы над лентой панели IDE: субагент, флот, фоновая команда, будильник. */
export type CapsuleKind = 'agent' | 'workflow' | 'command' | 'wakeup'

/** Идущая задача разговора капсулой: всё, что видно на ней и в листе по нажатию. */
export type Capsule = {
  /** id строки вызова в ленте. */
  id: string
  kind: CapsuleKind
  /** Тип субагента (reviewer, Explore); пусто - подпись по виду капсулы. */
  agent: string
  /** Чем агент занят прямо сейчас; у будильника - с чем он разбудит агента. */
  activity: string
  /** Поручение агента или что делает команда - словами модели. */
  description: string
  /** Задание агента целиком или команда как есть. */
  detail: string
  /** Начало по часам IDE (мс); 0 - неизвестно. */
  startedAt: number
  /** Когда CLI разбудит агента (часы IDE, мс); 0 - не будильник. */
  dueAt: number
  /** Флот workflow: законченные агенты из всех; null - не флот или отчёта ещё не было. */
  fleet: { done: number; total: number } | null
  /** Шагов внутри агента по счёту IDE. */
  steps: number
  /** Что остановить; null - нельзя (будильник, CLI не назвал задачу, провайдер не умеет). */
  stop: RunningTask | null
}

export type TaskCapsulesProps = {
  capsules: Capsule[]
  /** Насколько часы IDE впереди часов телефона: время на капсулах - по часам IDE. */
  offset: number
  /** id капсулы, чей лист открыт: она горит выбранной. */
  openId: string | null
  onOpen: (id: string) => void
}

export type CapsuleSheetProps = {
  capsule: Capsule
  offset: number
  onStop: ((capsule: Capsule) => void) | null
  onClose: () => void
}
