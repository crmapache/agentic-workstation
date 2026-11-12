import type { Conversation } from '@shared/claude'

/**
 * Тон режима: обычный - тихий, план - справочный, правки без вопроса - внимание, без
 * вопросов - красный.
 */
export type ModeTone = 'quiet' | 'info' | 'accent' | 'danger' | 'warning'

/** Раздел панели модели, усилия и режима. */
export type SetupSection = 'model' | 'effort' | 'mode'

/**
 * Где панель сейчас и как сюда попали: guided - шагами от открытия (выбор ведёт в следующий
 * раздел), иначе человек сам открыл раздел вкладкой или стрелкой - выбор закрывает панель.
 */
export type SetupFlow = { section: SetupSection; guided: boolean }

export type ComposerStatusProps = {
  conversation: Conversation
}

/** Части строки получают тот же разговор, что и сама строка. */
export type PickerProps = ComposerStatusProps

/**
 * Раздел панели: тот же разговор и шаг дальше - есть onPicked, значит выбор панель не
 * закрывает, а ведёт в следующий раздел.
 */
export type SectionProps = PickerProps & { onPicked?: (() => void) | undefined }
