/**
 * Чья стрелка: browser - Browser в странице Chrome (акцент), computer - Computer Use на всём
 * экране (стальной синий). Цвет говорит человеку, какой коннектор сейчас держит мышь.
 */
export type AgentPointerTone = 'browser' | 'computer'

export type AgentPointerProps = {
  tone: AgentPointerTone
  /** Номер нажатия: новый номер - круг от острия. 0 - нажатий ещё не было. */
  press?: number | undefined
}
