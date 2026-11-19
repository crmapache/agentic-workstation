import type { ExtensionDialog, ExtensionDialogAnswer } from '@shared/extension-ui'
import type { ExtensionPermission } from '@shared/extensions'

import type { ExtensionRuntime } from '../extension-runtime'
import type { ExtensionStorage } from '../extension-storage'

/** Проект, каким его видит расширение. */
export type ProjectView = { path: string; name: string; home: boolean; active: boolean }

/** Уведомление от расширения: в ленту уведомлений IDE от его имени. */
export type ExtensionNotice = {
  title: string
  body: string
  tone: 'info' | 'success' | 'attention' | 'danger'
  link: string | null
}

/** Ответ сети расширению: тело - текстом, не больше потолка. */
export type NetResponse = {
  status: number
  ok: boolean
  headers: Record<string, string>
  body: string
}

/** Инструмент IDE (workstation), как его видит расширение с правом ide.control. */
export type WorkstationToolInfo = {
  name: string
  description: string
  readOnly: boolean
  inputSchema: unknown
}

/** Что вклад поменял: окну - состояние, коннектору - список инструментов, виду - дерево. */
export type HostChange =
  | { kind: 'contributions' }
  | { kind: 'tools' }
  | { kind: 'theme' }
  | { kind: 'view'; local: string }

/**
 * Что ручкам расширений нужно от IDE (ADR 0091). Собирает ExtensionsService из сервисов IDE;
 * в проверках - подделка.
 */
export type HostContext = {
  projects: () => ProjectView[]
  notify: (runtime: ExtensionRuntime, notice: ExtensionNotice) => void
  openUrl: (url: string) => Promise<void>
  dialog: (runtime: ExtensionRuntime, dialog: ExtensionDialog) => Promise<ExtensionDialogAnswer>
  /** Вопрос окну о редакторе: ответ окна или ошибка, если окно молчит. */
  editor: (ask: {
    op: 'active' | 'insert' | 'replaceSelection' | 'open'
    text?: string
    path?: string
    projectPath?: string
    line?: number
  }) => Promise<unknown>
  showView: (key: string) => void
  /** Файл - в корзину системы, а не насовсем: удалённое расширением можно вернуть. */
  trash: (path: string) => Promise<void>
  storage: ExtensionStorage
  setting: (runtime: ExtensionRuntime, key: string) => string | boolean | null
  clipboard: { read: () => Promise<string>; write: (text: string) => Promise<void> }
  workstation: {
    tools: () => WorkstationToolInfo[]
    call: (tool: string, args: Record<string, unknown>) => Promise<unknown>
  }
  /** Команда любого запущенного расширения по ключу `<расширение>.<команда>`. */
  runCommand: (key: string, args: unknown[]) => Promise<unknown>
  /** Запрос в сеть; allowed - пускают ли рамки расширения на хост перенаправления. */
  fetch: (
    url: URL,
    init: { method: string; headers: Record<string, string>; body: string | null },
    allowed: (hostname: string) => boolean,
  ) => Promise<NetResponse>
  /** Программа из PATH человека в папке проекта: код выхода и вывод. */
  run: (
    command: string,
    args: string[],
    options: { cwd: string; timeoutMs: number; input: string | null },
  ) => Promise<{ code: number | null; stdout: string; stderr: string }>
  changed: (runtime: ExtensionRuntime, change: HostChange) => void
  /** Снять колбэк в песочнице: регистрацию сняли. */
  forget: (runtime: ExtensionRuntime, handler: number) => void
}

/** Вызов ручки: чьё расширение, аргументы JSON, что есть у IDE. */
export type HostCall = {
  runtime: ExtensionRuntime
  args: Record<string, unknown>
  context: HostContext
}

/** Ручка: какое право нужно (null - без прав) и что она делает. */
export type HostMethod = {
  permission: ExtensionPermission | null
  run: (call: HostCall) => unknown
}
