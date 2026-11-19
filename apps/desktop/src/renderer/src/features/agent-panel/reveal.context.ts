import { use, createContext } from 'react'

/**
 * Включена ли волна проявления для текста ниже: ставит её ответ, который печатается
 * на глазах (AssistantMessage), читают куски текста (RevealText). Везде прочее - план,
 * отчёт субагента, история - текст встаёт сразу.
 */
export const RevealContext = createContext(false)

export const useRevealOn = () => use(RevealContext)
