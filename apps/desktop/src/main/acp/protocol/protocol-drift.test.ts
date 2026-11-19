import { it, expect, describe } from 'vitest'

import { AGENT_METHODS, CLIENT_METHODS, PROTOCOL_VERSION } from '@agentclientprotocol/sdk/unstable'
import type {
  ToolKind,
  StopReason,
  SessionUpdate,
  ToolCallStatus,
  PermissionOptionKind,
} from '@agentclientprotocol/sdk/unstable'

import { ACP_PROTOCOL_VERSION } from '../client/acp.constants'
import type {
  AcpToolKind,
  AcpStopReason,
  AcpToolStatus,
  AcpSessionUpdate,
  AcpPermissionOption,
} from './acp-types'

/**
 * Свои типы ACP (acp-types.ts) против официальной схемы (ADR 0092): пакет
 * `@agentclientprotocol/sdk` - только для этой проверки, той же версии, на которой стоит сервер
 * Kimi. Поднимаем пакет - проверка говорит, что разошлось в том, на что опирается IDE. Типы
 * сверяет `tsc` (pnpm check), имена методов - тест.
 */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
type Within<A, B> = [A] extends [B] ? true : false

/** Виды, которые схема знает целиком, - у нас те же: новый вид в схеме - повод решить, как его показать. */
export const KINDS_MATCH: [
  Same<AcpToolKind, ToolKind>,
  Same<AcpToolStatus, ToolCallStatus>,
  Same<AcpStopReason, StopReason>,
  Same<AcpPermissionOption['kind'], PermissionOptionKind>,
  Within<AcpSessionUpdate['sessionUpdate'], SessionUpdate['sessionUpdate']>,
] = [true, true, true, true, true]

/** Что IDE зовёт у агента: панель, каталог, вход, исполнитель сценариев. */
const CALLED = [
  'initialize',
  'session/new',
  'session/load',
  'session/resume',
  'session/list',
  'session/fork',
  'session/close',
  'session/delete',
  'session/prompt',
  'session/cancel',
  'session/set_config_option',
  'session/set_mode',
  'logout',
]

/** На что IDE отвечает агенту (прочее - `-32601`). */
const ANSWERED = ['session/update', 'session/request_permission', 'elicitation/create']

describe('протокол ACP не разошёлся с официальной схемой', () => {
  it('методы, которые IDE зовёт и на которые отвечает, в схеме есть', () => {
    expect(Object.values(AGENT_METHODS)).toEqual(expect.arrayContaining(CALLED))
    expect(Object.values(CLIENT_METHODS)).toEqual(expect.arrayContaining(ANSWERED))
  })

  it('версия протокола - та, что в схеме', () => {
    expect(ACP_PROTOCOL_VERSION).toBe(PROTOCOL_VERSION)
  })
})
