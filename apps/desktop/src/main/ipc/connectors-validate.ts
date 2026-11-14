import { isAbsolute } from 'node:path'

import type { ConnectorAvailability } from '@shared/connector-availability'
import type { HttpConnectorSpec, GenerateConnectorRequest } from '@shared/connector-spec'
import type {
  AgentApp,
  AddToTypeRequest,
  UpdateTypeRequest,
  ConnectorInProject,
  AddConnectorRequest,
} from '@shared/connectors'
import {
  MCP_AUTHS,
  AGENT_APPS,
  CONNECTOR_KINDS,
  PLAYWRIGHT_PROFILES,
  BROWSER_PROFILE_NAME_MAX,
  CONNECTOR_DESCRIPTION_MAX,
  CONNECTOR_INSTRUCTIONS_MAX,
} from '@shared/connectors'

import { assertOneOf, assertString } from './validate'

/** Подпись, адрес, id - короткие строки: длиннее приходит только мусор. */
const MAX_FIELD = 2048

/** Ключи бывают длинными (JWT, ключи с подписью): им свой потолок, тоже с запасом. */
export const MAX_SECRET = 16_384

/** Сообщение ИИ о коннекторе: просьба словами, ссылки, кусок документации. */
const MAX_TELL = 20_000

/** Проектов в списке доступности больше не бывает: столько их не открывают. */
const MAX_PROJECTS = 500

const recordOf = (value: unknown): Record<string, unknown> =>
  (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>

export const field = (value: unknown, name: string, max = MAX_FIELD): string => {
  assertString(value, name)

  if (value.length > max) throw new Error(`Слишком длинное поле ${name}`)

  return value
}

export const assertBoolean = (value: unknown, name: string): boolean => {
  if (typeof value !== 'boolean') throw new Error(`Ожидалось да или нет в поле ${name}`)

  return value
}

const paths = (value: unknown, name: string): string[] => {
  if (!Array.isArray(value) || value.length > MAX_PROJECTS) throw new Error(`Плохой список ${name}`)

  return value.map((item) => field(item, name))
}

/** Доступность коннектора: во всех проектах или только в списке путей. */
export const assertAvailability = (value: unknown): ConnectorAvailability => {
  const record = recordOf(value)
  const mode = assertOneOf(record['mode'], ['all', 'only'], 'mode')

  if (mode === 'only') return { mode, projects: paths(record['projects'], 'projects') }

  return record['remembered'] === undefined
    ? { mode }
    : { mode, remembered: paths(record['remembered'], 'remembered') }
}

/** Описание коннектора: без пробелов по краям, не длиннее потолка, который держит и поле. */
export const assertDescription = (value: unknown): string =>
  field(value, 'description', CONNECTOR_DESCRIPTION_MAX).trim()

/** Путь проекта для настроек коннектора в нём: только абсолютный. */
export const assertProjectPath = (value: unknown): string => {
  const path = field(value, 'projectPath')

  if (!isAbsolute(path)) throw new Error('Путь проекта не абсолютный')

  return path
}

/** Настройки коннектора в проекте: инструкции и профиль Chrome, не длиннее потолков поля. */
export const assertInProject = (value: unknown): ConnectorInProject => {
  const record = recordOf(value)
  const profile = record['browserProfile']

  return {
    instructions: field(record['instructions'], 'instructions', CONNECTOR_INSTRUCTIONS_MAX).trim(),
    browserProfile:
      profile === null
        ? null
        : field(profile, 'browserProfile', BROWSER_PROFILE_NAME_MAX).trim() || null,
  }
}

/** Приложение ИИ, которому отдают настройку: только из своего списка. */
export const assertAgentApp = (value: unknown): AgentApp => assertOneOf(value, AGENT_APPS, 'app')

/** Ключи кандидатов импорта - строки из ответа candidates. */
export const assertKeys = (value: unknown): string[] => {
  if (!Array.isArray(value) || value.length > MAX_PROJECTS) throw new Error('Плохой список ключей')

  return value.map((item) => field(item, 'key'))
}

/** Просьба к ИИ: сервис, что сделать, адрес документации (сайт или пусто). */
export const assertGenerate = (value: unknown): GenerateConnectorRequest => {
  const record = recordOf(value)
  const docsUrl = field(record['docsUrl'], 'docsUrl').trim()

  if (docsUrl && !/^https?:\/\//i.test(docsUrl)) throw new Error('Адрес документации - сайт')

  return {
    service: field(record['service'], 'service', 200),
    goal: field(record['goal'], 'goal', 4000),
    docsUrl,
  }
}

/** Слова человека ИИ: не пустые и не книга. */
export const assertTell = (value: unknown): string => {
  const text = field(value, 'text', MAX_TELL).trim()

  if (!text) throw new Error('Пустое сообщение')

  return text
}

/** Просьба добавить коннектор: тип из списка, поля - строки своей длины. */
export const assertAddRequest = (value: unknown): AddConnectorRequest => {
  const request = recordOf(value)
  const kind = assertOneOf(request['kind'], CONNECTOR_KINDS, 'kind')

  // Браузеру для ИИ и Computer Use подпись не нужна: они одни, имя сервера постоянное.
  if (kind === 'browser' || kind === 'computer') return { kind }

  const label = field(request['label'], 'label')

  if (kind === 'slack') {
    return {
      kind,
      label,
      clientId: field(request['clientId'], 'clientId'),
      clientSecret: field(request['clientSecret'], 'clientSecret', MAX_SECRET),
    }
  }

  if (kind === 'todoist')
    return { kind, label, token: field(request['token'], 'token', MAX_SECRET) }

  if (kind === 'playwright') {
    return {
      kind,
      label,
      profile: assertOneOf(request['profile'], PLAYWRIGHT_PROFILES, 'profile'),
      profileDir: field(request['profileDir'], 'profileDir'),
      headless: assertBoolean(request['headless'], 'headless'),
      version: field(request['version'], 'version', 100),
    }
  }

  // Свой тип (ADR 0034): имя, «несколько раз» и подпись первого подключения.
  const newType = () => ({
    label,
    name: field(request['name'], 'name'),
    multiple: assertBoolean(request['multiple'], 'multiple'),
  })

  if (kind === 'mcp') {
    return {
      kind,
      ...newType(),
      // В адресе бывает ключ (?api_key=…) - потолок как у ключей.
      url: field(request['url'], 'url', MAX_SECRET),
      auth: assertOneOf(request['auth'], MCP_AUTHS, 'auth'),
      token: field(request['token'], 'token', MAX_SECRET),
    }
  }

  if (kind === 'command') {
    return {
      kind,
      ...newType(),
      commandLine: field(request['commandLine'], 'commandLine', MAX_SECRET),
      envLine: field(request['envLine'], 'envLine', MAX_SECRET),
    }
  }

  if (kind === 'http') {
    // Описание проверяет схема при добавлении (connector-add.ts) - здесь только форма.
    return {
      kind,
      ...newType(),
      spec: recordOf(request['spec']) as HttpConnectorSpec,
      secret: field(request['secret'], 'secret', MAX_SECRET),
      username: field(request['username'], 'username'),
    }
  }

  return { kind, label }
}

/** Ещё одно подключение своего типа: тип, подпись и вход этого подключения. */
export const assertAddToType = (value: unknown): AddToTypeRequest => {
  const request = recordOf(value)

  return {
    typeId: field(request['typeId'], 'typeId'),
    label: field(request['label'], 'label'),
    token: field(request['token'], 'token', MAX_SECRET),
    secret: field(request['secret'], 'secret', MAX_SECRET),
    username: field(request['username'], 'username'),
  }
}

/** Правка своего типа: имя и «несколько раз» - каждое по желанию. */
export const assertUpdateType = (value: unknown): UpdateTypeRequest => {
  const request = recordOf(value)
  const { name, multiple } = request

  return {
    typeId: field(request['typeId'], 'typeId'),
    ...(name === undefined ? {} : { name: field(name, 'name') }),
    ...(multiple === undefined ? {} : { multiple: assertBoolean(multiple, 'multiple') }),
  }
}
