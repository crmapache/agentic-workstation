import {
  Bell,
  Mail,
  Plug,
  Drama,
  Globe,
  Puzzle,
  ListTodo,
  AppWindow,
  CalendarDays,
  NotebookText,
  Presentation,
  SquareKanban,
  WandSparkles,
  MessagesSquare,
  SquareTerminal,
  MousePointerClick,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import type { ConnectorAvailability } from '@shared/connector-availability'
import type { GenerateConnectorRequest } from '@shared/connector-spec'
import type {
  ToolAccess,
  ConnectorKind,
  ConnectorStatus,
  ConnectorInProject,
} from '@shared/connectors'
import { MCP_AUTHS } from '@shared/connectors'
import { WALKTHROUGH_NEEDS } from '@shared/walkthrough'

import type { BadgeTone } from '@agentic-workstation/ui/Badge.types'

import type { AddKind } from '../connectors.types'
import type { AddFormFields } from './ConnectorsView.types'

export const KIND_ICONS: Record<ConnectorKind, LucideIcon> = {
  gmail: Mail,
  calendar: CalendarDays,
  notion: NotebookText,
  slack: MessagesSquare,
  atlassian: SquareKanban,
  todoist: ListTodo,
  playwright: Drama,
  browser: Globe,
  computer: MousePointerClick,
  walkthrough: Presentation,
  notifications: Bell,
  workstation: AppWindow,
  extensions: Puzzle,
  mcp: Plug,
  command: SquareTerminal,
  http: WandSparkles,
}

/**
 * Коннекторы к известным приложениям: имя сервиса - имя типа, его видно заголовком плитки.
 * Computer Use - на обеих системах IDE, мак и Windows (ADR 0057, 0058); Walkthrough - вслед за
 * ним: показ стоит на Computer Use и Browser (ADR 0134).
 */
export const APP_KINDS: readonly AddKind[] = [
  'gmail',
  'calendar',
  'notion',
  'slack',
  'atlassian',
  'todoist',
  'playwright',
  'browser',
  'computer',
  'walkthrough',
]

/**
 * Тишина после набора, через которую описание уходит в главный процесс: каждое сохранение
 * переподключает сервер у живых разговоров, на каждую букву это лишнее.
 */
export const DESCRIPTION_SAVE_MS = 1000

/** Коннектору в проекте ничего не сказано: ни инструкций, ни профиля Chrome. */
export const NOTHING_SAID: ConnectorInProject = { instructions: '', browserProfile: null }

/**
 * Коннекторы без раздела подключения (адрес, команда, вход): свои инструменты IDE поверх её же
 * частей - браузер, компьютер, уведомления и сама IDE.
 */
export const NO_CONNECTION_KINDS: readonly ConnectorKind[] = [
  'browser',
  'computer',
  'walkthrough',
  'notifications',
  'workstation',
]

/** Тон плитки типа в каталоге: разные сервисы узнаются цветом, смысла состояния в нём нет. */
export const KIND_TONES: Record<ConnectorKind, BadgeTone> = {
  gmail: 'danger',
  calendar: 'info',
  notion: 'neutral',
  slack: 'warning',
  atlassian: 'info',
  todoist: 'danger',
  playwright: 'success',
  browser: 'accent',
  computer: 'info',
  walkthrough: 'accent',
  notifications: 'accent',
  workstation: 'accent',
  extensions: 'accent',
  mcp: 'accent',
  command: 'neutral',
  http: 'success',
}

export const STATUS_TONES: Record<ConnectorStatus, BadgeTone> = {
  connected: 'success',
  'signed-out': 'warning',
  'signing-in': 'info',
  failed: 'danger',
  disabled: 'neutral',
}

/** Тон ступени доступа: чтение спокойное, запись заметная, отправка - внимание. */
export const ACCESS_TONES: Record<ToolAccess, BadgeTone> = {
  read: 'neutral',
  write: 'info',
  outbound: 'warning',
}

/** Порядок групп инструментов: сначала безопасное, отправка людям - последней. */
export const ACCESS_ORDER: readonly ToolAccess[] = ['read', 'write', 'outbound']

/** Длина пояснения инструмента в строке: у Notion описания - целые страницы. */
export const TOOL_DESCRIPTION_MAX = 140

export const GOOGLE_STEPS = ['one', 'two', 'three', 'four'] as const

export const GOOGLE_CONSOLE_URL = 'https://console.cloud.google.com/auth/clients'

export const SLACK_APPS_URL = 'https://api.slack.com/apps'

/** Шаги установки расширения браузера для ИИ: режим разработчика, Load unpacked, закрепить. */
export const BROWSER_STEPS = ['one', 'two', 'three'] as const

/** Разрешения macOS для Computer Use: мышь и клавиатура, потом экран. */
export const COMPUTER_PERMISSIONS = ['accessibility', 'screen'] as const

/** Шаги своего Slack app: создать по готовому описанию, включить MCP, взять ключи. */
export const SLACK_STEPS = ['one', 'two', 'three'] as const

/** Пустая форма: вход своего MCP - в браузере, как у большинства серверов с OAuth. */
export const EMPTY_ADD_FIELDS: AddFormFields = {
  name: '',
  multiple: false,
  label: '',
  clientId: '',
  clientSecret: '',
  url: '',
  auth: 'oauth',
  token: '',
  commandLine: '',
  envLine: '',
  profile: 'isolated',
  profileDir: '',
  headless: true,
  version: '',
}

/** Способы входа своего MCP по порядку вкладок. */
export const MCP_AUTH_OPTIONS = MCP_AUTHS

/** Пустая просьба к ИИ. */
export const EMPTY_AI_REQUEST: GenerateConnectorRequest = {
  service: '',
  goal: '',
  docsUrl: '',
  provider: 'claude',
  model: '',
  effort: '',
}

/** Режимы доступности по порядку вкладок: во всех проектах или только в отмеченных. */
export const AVAILABILITY_MODES: readonly ConnectorAvailability['mode'][] = ['all', 'only']

/** Сведения, которые копируют: адрес и команда - строкой кода с кнопкой копии. */
export const CODE_FACTS: ReadonlySet<string> = new Set(['address', 'command'])

/** Иконка папки в плашке проекта - в гнезде значка проекта. */
export const FOLDER_ICON_SIZE = 14

/**
 * Без чего показа Walkthrough нет (ADR 0134): строки окна коннектора - Computer Use и Browser Use,
 * как их проверяет главный процесс, и голос - показ идёт звонком.
 */
export const WALKTHROUGH_NEEDS_SHOWN = [...WALKTHROUGH_NEEDS, 'voice'] as const
