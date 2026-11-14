import type { KeyboardEvent } from 'react'

import type { ComputerState } from '@shared/computer'
import type { SelectedProjects } from '@shared/connector-availability'
import type { AiJob, AiProposal, GenerateConnectorRequest } from '@shared/connector-spec'
import type {
  McpAuth,
  AgentApp,
  Connector,
  CustomType,
  BrowserState,
  ConnectorKind,
  GoogleAppState,
  ConnectorsState,
  AddConnectorError,
  PlaywrightProfile,
  BrowserProfileView,
} from '@shared/connectors'
import type { ProjectRef } from '@shared/workspace'

import type { AddTarget } from '../connectors.types'

/** Поля формы нового коннектора: каждому типу нужна своя часть. */
export type AddFormFields = {
  /** Имя своего типа (Playwright) - у своего MCP и команды. */
  name: string
  /** Свой тип подключают несколько раз - тогда нужна и подпись подключения. */
  multiple: boolean
  label: string
  clientId: string
  clientSecret: string
  url: string
  auth: McpAuth
  token: string
  commandLine: string
  envLine: string
  /** Playwright: профиль браузера, папка сохранённого, без окна, версия (пусто - latest). */
  profile: PlaywrightProfile
  profileDir: string
  headless: boolean
  version: string
}

/** Форма нового коннектора: поля, причина отказа, отправка. */
export type AddFormState = {
  fields: AddFormFields
  set: <K extends keyof AddFormFields>(key: K) => (value: AddFormFields[K]) => void
  /** Несколько полей разом - имя своего типа, «несколько раз», подпись. */
  patch: (change: Partial<AddFormFields>) => void
  error: AddConnectorError | null
  isBusy: boolean
  submit: () => Promise<void>
  /** Enter в поле добавляет коннектор. */
  handleKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
}

/** Имя нового своего типа, «несколько раз» и подпись первого подключения. */
export type TypeNameValues = { name: string; multiple: boolean; label: string }

/** Поля имени нового своего типа: значения и правка частью. */
export type TypeNameFieldsProps = {
  values: TypeNameValues
  onChange: (patch: Partial<TypeNameValues>) => void
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
  /**
   * Фокус на имени при появлении (по умолчанию - да). Нет - в окне работы ИИ: предложение
   * приходит, пока человек пишет ИИ, и фокус из его поля уводить нельзя.
   */
  autoFocus?: boolean | undefined
}

/** Свой тип и сколько у него подключений: окно типа из каталога и его части. */
export type TypePartProps = { type: CustomType; connections: number }

/** Форма ещё одного подключения своего типа. */
export type AddToTypeFormProps = { type: CustomType; onAdded: OnAdded; onCancel: () => void }

/** Тип коннектора с обычной формой; коннектор от ИИ добавляет свой поток (AiConnectorFlow). */
export type FormKind = Exclude<ConnectorKind, 'http'>

/** Добавлен - id нового (окно покажет его); null - добавлено несколько или ничего. */
export type OnAdded = (id: string | null) => void

/** Просьба к ИИ: ушла в очередь - форма закрывается (onStarted). */
export type AiConnectorFlowProps = { onStarted: () => void; onCancel: () => void }

/**
 * Готовое описание от ИИ на проверке: просьба - ради адреса документации (чужой хост),
 * onAdded - коннектор добавлен.
 */
export type AiSpecReviewProps = {
  proposal: Extract<AiProposal, { kind: 'http' }>
  request: GenerateConnectorRequest
  onAdded: OnAdded
}

/** Очередь работ ИИ на виде: новые - первыми. */
export type AiJobsProps = { jobs: AiJob[] }

export type AddConnectorFormProps = {
  kind: FormKind
  googleReady: boolean
  /** Поля, заполненные заранее: MCP-сервер, который нашёл ИИ (ADR 0050). */
  initial?: Partial<AddFormFields> | undefined
  /** Фокус на первом поле при появлении (по умолчанию - да); см. TypeNameFieldsProps. */
  autoFocus?: boolean | undefined
  onAdded: OnAdded
  /** Нет - кнопки Cancel нет: форма стоит в окне, которое закрывают крестиком. */
  onCancel?: (() => void) | undefined
}

export type ImportPanelProps = { onDone: () => void }

/** Папки, которых нет среди проектов, и куда можно перенести их выбор коннекторов. */
export type ForgottenProjectsProps = {
  connectors: Connector[]
  forgotten: string[]
  projects: ProjectRef[]
}

/** Сетка подключённых: коннекторы и известные проекты - для подписи «где виден». */
export type ConnectorGridProps = { connectors: Connector[]; projects: ProjectRef[] }

/** Каталог: свои типы - рядом с Gmail. */
export type AddCatalogProps = { types: CustomType[] }

/** Состояние коннекторов целиком и известные проекты - окну, какое бы ни было открыто. */
export type ConnectorsModalsProps = { state: ConnectorsState; projects: ProjectRef[] }

export type ConnectorModalProps = {
  connector: Connector
  projects: ProjectRef[]
  google: GoogleAppState
  /** Свой тип подключения и сколько у него подключений; у встроенных - null. */
  customType: TypePartProps | null
  /** Мост в Chrome - окну коннектора Browser (ADR 0040). */
  browser: BrowserState
  /** Разрешения macOS - окну коннектора Computer Use (ADR 0057). */
  computer: ComputerState
}

/** Установка расширения браузера и профили Chrome на связи. */
export type BrowserSetupProps = { browser: BrowserState }

/** Разрешения macOS для Computer Use. */
export type ComputerSetupProps = { computer: ComputerState }

/** Инструкции коннектора в открытом проекте; у Browser - и профиль Chrome из подключённых. */
/**
 * Инструкции коннектора по проектам: проекты, где он виден, и с какого начать (открытый, если он
 * среди них); у Browser - и профиль Chrome из подключённых.
 */
export type ProjectInstructionsProps = {
  connector: Connector
  projects: ProjectRef[]
  initial: string
  browser: BrowserState
}

/** Поля одного проекта: его путь, коннектор и подключённые профили Chrome. */
export type InProjectFieldsProps = {
  connector: Connector
  projectPath: string
  browser: BrowserState
}

/** Выбор проекта для инструкций: у каких проектов они уже есть - видно в списке. */
export type ProjectSelectProps = {
  projects: ProjectRef[]
  value: string
  said: readonly string[]
  onPick: (projectPath: string) => void
}

/** Профиль Chrome проекта: выбранное имя (null - не выбран), подключённые и все профили. */
export type BrowserProfilePickerProps = {
  value: string | null
  profiles: BrowserProfileView[]
  chromeProfiles: BrowserState['chromeProfiles']
  onPick: (profile: string | null) => void
}

/** Подключение коннектора: клиент Google - на случай его сбоя. */
export type ConnectorConnectionProps = { connector: Connector; google: GoogleAppState }

export type AddModalProps = { target: AddTarget; google: GoogleAppState }

/** О чём справка у заголовка: вид целиком или его раздел. */
export type ConnectorsHelpProps = {
  topic:
    | 'page'
    | 'description'
    | 'type'
    | 'projects'
    | 'tools'
    | 'forgotten'
    | 'google'
    | 'browser'
    | 'computer'
    | 'inProject'
    | 'aiJobs'
}

/**
 * Профиль Chrome в выборе проекта: имя и что с ним сейчас - на связи, расширение стоит, но
 * профиль не на связи (окно закрыто), или расширения в нём нет.
 */
export type ProfileChoice = { name: string; state: 'connected' | 'offline' | 'missing' }

/** Часть окна одного коннектора. */
export type ConnectorPartProps = { connector: Connector }

export type ProjectsPickerProps = { connector: Connector; projects: ProjectRef[] }

/** Плашки режима «только в отмеченных»: его список и известные проекты. */
export type ProjectChipsProps = {
  connector: Connector
  selected: SelectedProjects
  projects: ProjectRef[]
}

/**
 * Меню «Set up with AI» в карточке клиента Google: приложение ИИ не открылось - onOpenFailed
 * с ним, открылось - с null (прежний отказ больше не верен).
 */
export type GoogleSetupMenuProps = {
  onOpenFailed: (app: AgentApp | null) => void
}
