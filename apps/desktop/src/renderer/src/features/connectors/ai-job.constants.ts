import type { AiJobStatus } from '@shared/connector-spec'

import type { BadgeTone } from '@agentic-workstation/ui/Badge.types'

/**
 * Тон метки работы ИИ: идёт - справка, предлагает коннектор - в порядке, ждёт человека -
 * внимание, остановлена - тихо, сломалась - ошибка.
 */
export const AI_JOB_TONES: Record<AiJobStatus, BadgeTone> = {
  working: 'info',
  ready: 'success',
  asking: 'warning',
  stopped: 'neutral',
  failed: 'danger',
}

/** Имя вызова, которым CLI отдаёт ответ по схеме: в ленте работы он - слова ИИ человеку. */
export const ANSWER_TOOL = 'StructuredOutput'
