/** Вид расширения IDE (ADR 0091): `ext:<расширение>.<вид>`. */
export type ExtensionViewId = `ext:${string}`

/** Виды зоны 5 (левая панель), переключаются иконками зоны 2; расширения добавляют свои. */
export type SideViewId = 'files' | 'changes' | ExtensionViewId

/** Виды зоны 6 (середина окна), переключаются иконками полосы слева от неё. */
export type MainViewId =
  | 'file'
  | 'tracker'
  | 'scenarios'
  | 'tasks'
  | 'statistics'
  | 'connectors'
  | 'inbox'
  | 'extensions'
  | ExtensionViewId

/**
 * GUI провайдеров LLM в зоне 7 (правая панель), переключаются иконками зоны 3 (ADR 0083):
 * Claude Code, Codex, открытые модели. Какие из них уже есть - PROVIDER_VIEW_IDS.
 */
export type ProviderViewId = 'claude-code' | 'codex' | 'antigravity' | 'kimi' | 'open-models'

/** Область окна с видами: какой вид выбран и развёрнута ли она. Такова середина окна. */
export type ViewAreaState<ViewId extends string> = {
  activeViewId: ViewId
  isOpen: boolean
}

/** Боковая панель - область с видами, у которой ещё и своя ширина. */
export type PanelState<ViewId extends string> = ViewAreaState<ViewId> & {
  /** Ширина в пикселях, которую выбрал человек, - не уже PANEL_MIN_WIDTH. */
  width: number
}

export type PanelSide = 'side' | 'provider'

/**
 * Терминал внизу правой колонки, под GUI провайдера (ADR 0037): открыт ли и какую долю
 * высоты колонки занимает. Доля, а не пиксели: окно меняет высоту, а раздел остаётся там же.
 */
export type TerminalDockState = { isOpen: boolean; share: number }

/** Раскладка целиком: так она сохраняется и восстанавливается. */
export type Layout = {
  side: PanelState<SideViewId>
  main: ViewAreaState<MainViewId>
  provider: PanelState<ProviderViewId>
  terminal: TerminalDockState
}

/**
 * Своя часть раскладки у каждого проекта: какой вид выбран в каждой области и что
 * развёрнуто, вместе с терминалом. Ширины панелей и доля терминала - одни на окно: это
 * размер окна и глаза человека, а не проект.
 */
export type ProjectViews = {
  side: ViewAreaState<SideViewId>
  main: ViewAreaState<MainViewId>
  provider: ViewAreaState<ProviderViewId>
  terminal: Pick<TerminalDockState, 'isOpen'>
}

/**
 * Раскладка вместе с проектами: поля Layout - раскладка проекта projectId, у остальных
 * открытых проектов - их виды в viewsByProject.
 */
export type ProjectLayouts = Layout & {
  /** Чья раскладка в полях Layout; null - ещё ничья (раскладка от версии без проектов). */
  projectId: string | null
  viewsByProject: Record<string, ProjectViews>
}

/**
 * Раскладка на экране: сколько пикселей у каждой области при нынешнем месте в окне.
 * Сохранённые ширины - то, чего хочет человек; здесь - то, что влезло. Правая колонка
 * здесь - вместе с местом середины, которое она забрала, когда середине его не хватило.
 */
export type Arrangement = Record<PanelSide, number> & {
  /** Сколько места у середины на экране - развёрнутой или нет; забранное колонкой - ноль. */
  main: number
  /** Видна ли левая панель: развёрнута и влезает рядом с правой колонкой (isSideShown). */
  isSideShown: boolean
  /** Видна ли середина: развёрнута и ей хватает места (MAIN_MIN_WIDTH). */
  isMainShown: boolean
}
