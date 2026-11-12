import type { ScenarioScope } from '@shared/scenarios'

/** Тип данных перетаскивания: чужое (файлы из Finder) полки не принимают. */
export const DRAG_TYPE = 'application/x-agentic-workstation-scenario'

/**
 * Прозрачная точка вместо системной картинки переноса: за рукой едет своя копия строки
 * (LiftedRow), а системный снимок, сделанный в начале жеста, не перерисовать.
 */
export const BLANK_DRAG_IMAGE =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

/** Иконки строки - ростом с маленький контрол без полей (как --size-icon-sm). */
export const ROW_ICON_SIZE = 14

/** Нажатие на них - их собственное, а не «открыть сценарий». */
export const OWN_PRESS = 'button, [role="button"], a'

/** Слова каждой полки: заголовок, пояснение за «?» и пустая полка. */
export const SHELF_WORDS = {
  project: {
    title: 'scenarios.library.project',
    help: 'scenarios.library.help.project',
    empty: 'scenarios.library.projectEmpty',
  },
  user: {
    title: 'scenarios.library.user',
    help: 'scenarios.library.help.user',
    empty: 'scenarios.library.userEmpty',
  },
} as const satisfies Record<ScenarioScope, Record<string, string>>
