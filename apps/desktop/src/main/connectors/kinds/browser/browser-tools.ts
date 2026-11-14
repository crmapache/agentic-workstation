import { ToolOutput, NativeSource } from '../native-tools'
import type { NativeTool } from '../native-tools'
import { toolJson } from '../../connector-source'
import { BrowserAgent } from '../../../browser/browser-agent'
import { BrowserError } from '../../../browser/browser-error'
import type { HubPort } from '../../../browser/browser-hub'
import type { ProfileOpening } from '../../../browser/chrome-profiles'
import { KeyComboError } from '../../../browser/page-keys'
import { agentCall } from './browser-args'
import { BROWSER_INPUT_TOOLS } from './browser-input-tools'
import { BROWSER_PAGE_TOOLS } from './browser-page-tools'
import { BROWSER_READ_TOOLS } from './browser-read-tools'

/**
 * Заметки сессии (страница не дала уйти, Chrome забрал вкладку у отладчика) - к ответу
 * инструмента: модель узнаёт о них тем же ходом. Отказ получает их в свой текст: часто они и
 * есть его причина.
 */
const withNotes = (tool: NativeTool<BrowserAgent>): NativeTool<BrowserAgent> => ({
  ...tool,
  run: async (args, agent, call) => {
    let value: unknown

    try {
      value = await tool.run(args, agent, call)
    } catch (error) {
      const notes = agent.takeNotes(agentCall(call))

      if (!notes.length || !(error instanceof BrowserError)) throw error

      throw new BrowserError(error.code, [error.message, ...notes].join('\n'))
    }

    const notes = agent.takeNotes(agentCall(call))

    if (!notes.length) return value

    const result = value instanceof ToolOutput ? value.result : toolJson(value)

    return new ToolOutput({
      ...result,
      content: [...result.content, ...notes.map((text) => ({ type: 'text' as const, text }))],
    })
  },
})

/**
 * Инструменты сервера browser-chrome (ADR 0040): чтение - профили, вкладки, снимок,
 * картинка, консоль; запись - вкладки, переходы, мышь и клавиатура, ожидание, выражение,
 * конец работы; отправка (выключена, пока не включит человек) - загрузка файла на сайт.
 * Отдельного «отправить» для клика нет: клик по «Отправить» не отличить от любого клика.
 */
export const BROWSER_TOOLS: readonly NativeTool<BrowserAgent>[] = [
  ...BROWSER_READ_TOOLS,
  ...BROWSER_PAGE_TOOLS,
  ...BROWSER_INPUT_TOOLS,
].map(withNotes)

/** Ошибки браузера и разбора клавиш модели полезны текстом: она поправит вызов. */
const BROWSER_EXPLAINABLE = [BrowserError, KeyComboError]

/**
 * Источник коннектора Browser: один на коннектор, сессии внутри - по разговорам. Конец
 * процесса разговора ждёт его следующий процесс, закрытый разговор и выключение или удаление
 * коннектора закрывают сессии сразу.
 */
export const createBrowserSource = (
  hub: HubPort,
  projectProfile: (projectPath: string) => string | null = () => null,
  openProfile?: (name: string) => Promise<ProfileOpening>,
): NativeSource<BrowserAgent> => {
  const agent = new BrowserAgent(hub, { projectProfile, openProfile })

  return new NativeSource(BROWSER_TOOLS, agent, BROWSER_EXPLAINABLE, {
    release: (launch) => agent.release(launch),
    endConversation: (conversationId) => agent.endConversation(conversationId),
    dispose: () => agent.dispose(),
  })
}
