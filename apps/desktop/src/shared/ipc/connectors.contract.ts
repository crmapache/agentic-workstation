import type { ConnectorAvailability } from '../connector-availability'
import type { GenerateConnectorRequest } from '../connector-spec'
import type {
  AgentApp,
  ImportOutcome,
  ConnectorsState,
  ImportCandidate,
  AddToTypeRequest,
  GoogleAppOutcome,
  UpdateTypeRequest,
  AddConnectorOutcome,
  AddConnectorRequest,
} from '../connectors'

type ConnectorRequest = { id: string }

/**
 * Часть контракта (contract.ts) про коннекторы к приложениям (ADR 0028). Состояние целиком
 * у главного процесса: каждый ответ - новое состояние, а вход, который кончился в
 * браузере, приходит событием.
 */
export type ConnectorsInvokeContract = {
  'connectors:get': { request: void; response: ConnectorsState }
  'connectors:add': { request: AddConnectorRequest; response: AddConnectorOutcome }
  'connectors:remove': { request: ConnectorRequest; response: ConnectorsState }
  /** Ещё одно подключение своего типа «несколько раз» (ADR 0034). */
  'connectors:addToType': { request: AddToTypeRequest; response: AddConnectorOutcome }
  /** Свой тип из каталога - вместе с его подключениями. */
  'connectors:removeType': { request: { typeId: string }; response: ConnectorsState }
  /** Имя своего типа и «несколько раз»; имена серверов остаются. */
  'connectors:updateType': { request: UpdateTypeRequest; response: ConnectorsState }
  /** Открыть браузер для входа. Ответ - сразу, со статусом signing-in; итог - событием. */
  'connectors:signIn': { request: ConnectorRequest; response: ConnectorsState }
  'connectors:cancelSignIn': { request: ConnectorRequest; response: ConnectorsState }
  /** Забыть вход: токены удаляются, коннектор остаётся. */
  'connectors:signOut': { request: ConnectorRequest; response: ConnectorsState }
  'connectors:setEnabled': {
    request: ConnectorRequest & { enabled: boolean }
    response: ConnectorsState
  }
  'connectors:setToolEnabled': {
    request: ConnectorRequest & { tool: string; enabled: boolean }
    response: ConnectorsState
  }
  /** Перечитать инструменты у сервиса; пометка «вход пропал» снимается, если ключ ожил. */
  'connectors:refresh': { request: ConnectorRequest; response: ConnectorsState }
  /** Новый ключ своего MCP с входом по ключу. */
  'connectors:setToken': {
    request: ConnectorRequest & { token: string }
    response: ConnectorsState
  }
  /**
   * Описание человека: что это за коннектор. Модель получает его в пояснении сервера -
   * живые разговоры переподключают сервер и видят новое.
   */
  'connectors:setDescription': {
    request: ConnectorRequest & { description: string }
    response: ConnectorsState
  }
  /** В каких проектах коннектор виден: процессы затронутых проектов перезапускаются. */
  'connectors:setAvailability': {
    request: ConnectorRequest & { availability: ConnectorAvailability }
    response: ConnectorsState
  }
  /** MCP-серверы из конфига Claude Code, которые можно перенести коннекторами. */
  'connectors:importCandidates': { request: void; response: ImportCandidate[] }
  'connectors:import': { request: { keys: string[] }; response: ImportOutcome }
  /**
   * ИИ читает документацию сервиса и описывает коннектор (минуты); ключа он не видит. Ответ -
   * сразу, с работой в generation; итог - событием состояния.
   */
  'connectors:generate': { request: GenerateConnectorRequest; response: ConnectorsState }
  'connectors:cancelGenerate': { request: void; response: ConnectorsState }
  /** Забыть итог работы ИИ (человек ушёл назад): generation снова пуст. */
  'connectors:dismissGeneration': { request: void; response: ConnectorsState }
  /** Системный выбор файла клиента OAuth, скачанного из Google Cloud Console. */
  'connectors:importGoogleApp': { request: void; response: GoogleAppOutcome }
  'connectors:forgetGoogleApp': { request: void; response: ConnectorsState }
  /** Приложения ИИ на этом Mac, которым можно отдать настройку в браузере (Claude, Codex). */
  'connectors:agentApps': { request: void; response: AgentApp[] }
  /**
   * Новый разговор в приложении ИИ с промптом в поле ввода, отправляет человек. Нет
   * приложения или macOS его не открыла - false.
   */
  'connectors:openInAgentApp': { request: { app: AgentApp; prompt: string }; response: boolean }
  /**
   * Открыть в браузере создание Slack app с готовым описанием: адрес возврата и разрешения
   * Slack MCP уже вписаны. Браузер не открылся - false.
   */
  'connectors:createSlackApp': { request: void; response: boolean }
  /**
   * Показать в Finder папку расширения браузера для ИИ (ADR 0040) - её человек выбирает в
   * «Load unpacked». Моста ещё нет - false.
   */
  'connectors:revealBrowserExtension': { request: void; response: boolean }
  /**
   * Открыть chrome://extensions в Google Chrome. Chrome нет или macOS не открыла - false:
   * окно копирует адрес, человек вставляет его сам.
   */
  'connectors:openBrowserExtensions': { request: void; response: boolean }
}

export type ConnectorsEventContract = {
  'connectors:state': ConnectorsState
}

/** Каналы этой части в рантайме: их разворачивает INVOKE_CHANNELS. */
export const CONNECTORS_CHANNELS = {
  'connectors:get': true,
  'connectors:add': true,
  'connectors:remove': true,
  'connectors:addToType': true,
  'connectors:removeType': true,
  'connectors:updateType': true,
  'connectors:signIn': true,
  'connectors:cancelSignIn': true,
  'connectors:signOut': true,
  'connectors:setEnabled': true,
  'connectors:setToolEnabled': true,
  'connectors:refresh': true,
  'connectors:setToken': true,
  'connectors:setDescription': true,
  'connectors:setAvailability': true,
  'connectors:importCandidates': true,
  'connectors:import': true,
  'connectors:generate': true,
  'connectors:cancelGenerate': true,
  'connectors:dismissGeneration': true,
  'connectors:importGoogleApp': true,
  'connectors:forgetGoogleApp': true,
  'connectors:agentApps': true,
  'connectors:openInAgentApp': true,
  'connectors:createSlackApp': true,
  'connectors:revealBrowserExtension': true,
  'connectors:openBrowserExtensions': true,
} satisfies Record<keyof ConnectorsInvokeContract, true>

/** События этой части: их разворачивает EVENT_CHANNELS. */
export const CONNECTORS_EVENTS = {
  'connectors:state': true,
} satisfies Record<keyof ConnectorsEventContract, true>
