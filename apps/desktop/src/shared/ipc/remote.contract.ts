import type { RemoteView, RemotePending } from '../remote'

/**
 * Часть контракта (contract.ts) про Remote Control (ADR 0041). Каждое действие отвечает
 * видом целиком, перемены сами по себе (телефон подключился, ждёт Approve) - событием.
 * Правила - .claude/rules/ipc-contract.md.
 */
export type RemoteInvokeContract = {
  'remote:get': { request: void; response: RemoteView }
  /** Включить или выключить связь с релеем. Выключено по умолчанию. */
  'remote:setEnabled': { request: { enabled: boolean }; response: RemoteView }
  /** Новый одноразовый код пары на три минуты. Только при включённой связи. */
  'remote:startPairing': { request: void; response: RemoteView }
  /**
   * Человек сверил отпечаток и пускает ждущий телефон - тот, что видел в окне: адрес и
   * отпечаток должны совпасть с ждущим сейчас, иначе никто не пускается.
   */
  'remote:approve': {
    request: Pick<RemotePending, 'deviceId' | 'fingerprint'>
    response: RemoteView
  }
  /** Отказать ждущему или перестать предлагать код - одно: код и ждущий забыты. */
  'remote:refuse': { request: void; response: RemoteView }
  /** Отпустить телефон: его ключ удаляется, кадры перестают открываться и при выключенной связи. */
  'remote:revoke': { request: { deviceId: string }; response: RemoteView }
}

export type RemoteEventContract = {
  'remote:state': RemoteView
}

export const REMOTE_CHANNELS = {
  'remote:get': true,
  'remote:setEnabled': true,
  'remote:startPairing': true,
  'remote:approve': true,
  'remote:refuse': true,
  'remote:revoke': true,
} satisfies Record<keyof RemoteInvokeContract, true>

export const REMOTE_EVENTS = {
  'remote:state': true,
} satisfies Record<keyof RemoteEventContract, true>
