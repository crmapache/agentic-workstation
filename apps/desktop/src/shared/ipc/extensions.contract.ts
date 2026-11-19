import type {
  UiEvent,
  ExtensionViewTree,
  ExtensionDialogAnswer,
  ExtensionDialogRequest,
} from '../extension-ui'
import type {
  ExtensionsState,
  ExtensionLogEntry,
  ExtensionDraftRequest,
  ExtensionSettingValue,
  ExtensionsActionResult,
} from '../extensions'

/**
 * Часть контракта про расширения IDE (ADR 0091). Состояние держит главный процесс, окно - зеркало
 * в кэше; деревья видов, журналы и вопросы человеку идут своими событиями: они чаще и тяжелее.
 */
export type ExtensionsInvokeContract = {
  'extensions:get': { request: void; response: ExtensionsState }
  /** Последние деревья всех видов: окну, которое поднялось после расширений. */
  'extensions:views': { request: void; response: ExtensionViewTree[] }
  'extensions:setEnabled': {
    request: { id: string; enabled: boolean }
    response: ExtensionsActionResult
  }
  /** Выдать то, что просит манифест сейчас, целиком. */
  'extensions:approve': { request: { id: string }; response: ExtensionsActionResult }
  'extensions:reload': { request: { id: string }; response: ExtensionsActionResult }
  /** Убрать расширение: папку - в корзину, его данные и секреты - забыть. */
  'extensions:remove': { request: { id: string }; response: ExtensionsActionResult }
  'extensions:setSetting': {
    request: { id: string; key: string; value: ExtensionSettingValue }
    response: ExtensionsActionResult
  }
  'extensions:logs': { request: { id: string }; response: ExtensionLogEntry[] }
  'extensions:clearLogs': { request: { id: string }; response: ExtensionLogEntry[] }
  'extensions:runCommand': { request: { key: string }; response: void }
  'extensions:viewEvent': { request: { key: string; event: UiEvent }; response: void }
  'extensions:statusClick': { request: { key: string }; response: void }
  'extensions:answerDialog': {
    request: { requestId: string; answer: ExtensionDialogAnswer }
    response: void
  }
  /** Вопросы расширений, которые ждут человека: окну, которое поднялось позже них. */
  'extensions:pendingDialogs': { request: void; response: ExtensionDialogRequest[] }
  /** Ответ окна на вопрос главного процесса о редакторе (ide.editor). */
  'extensions:answerEditor': { request: { requestId: string; answer: unknown }; response: void }
  /** Новое расширение с ИИ: заготовка, папка проектом, разговор с просьбой человека. */
  'extensions:create': { request: ExtensionDraftRequest; response: ExtensionsActionResult }
  /** Поправить расширение с ИИ: папка проектом и разговор со словами человека. */
  'extensions:editWithAi': {
    request: { id: string; request: string; provider: string }
    response: ExtensionsActionResult
  }
  'extensions:reveal': { request: { id: string | null }; response: void }
}

/** Вопрос главного процесса окну о редакторе: что открыто, вставить, заменить выделенное. */
export type ExtensionEditorAsk = {
  requestId: string
  op: 'active' | 'insert' | 'replaceSelection' | 'open'
  text?: string | undefined
  path?: string | undefined
  projectPath?: string | undefined
  line?: number | undefined
}

export type ExtensionsEventContract = {
  'extensions:changed': ExtensionsState
  'extensions:view': ExtensionViewTree
  'extensions:logged': { id: string; entries: ExtensionLogEntry[] }
  'extensions:dialog': ExtensionDialogRequest
  /** Вопрос снят без ответа: расширение остановилось или передумало. */
  'extensions:dialogClosed': { requestId: string }
  'extensions:editorAsk': ExtensionEditorAsk
  /** Показать вид расширения: `ide.ui.showView`. */
  'extensions:showView': { key: string }
}

export const EXTENSIONS_CHANNELS = {
  'extensions:get': true,
  'extensions:views': true,
  'extensions:setEnabled': true,
  'extensions:approve': true,
  'extensions:reload': true,
  'extensions:remove': true,
  'extensions:setSetting': true,
  'extensions:logs': true,
  'extensions:clearLogs': true,
  'extensions:runCommand': true,
  'extensions:viewEvent': true,
  'extensions:statusClick': true,
  'extensions:answerDialog': true,
  'extensions:pendingDialogs': true,
  'extensions:answerEditor': true,
  'extensions:create': true,
  'extensions:editWithAi': true,
  'extensions:reveal': true,
} satisfies Record<keyof ExtensionsInvokeContract, true>

export const EXTENSIONS_EVENTS = {
  'extensions:changed': true,
  'extensions:view': true,
  'extensions:logged': true,
  'extensions:dialog': true,
  'extensions:dialogClosed': true,
  'extensions:editorAsk': true,
  'extensions:showView': true,
} satisfies Record<keyof ExtensionsEventContract, true>
