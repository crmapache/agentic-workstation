import type { ParseKeys } from 'i18next'

import type { ToolsFailure } from '@shared/claude-tools'
import { SECOND_MS } from '@shared/time-units'

import type { MenuScreen } from './claude.types'

/**
 * Ступени шкалы контекста, как в ACC: до половины - зелёная, до 70% - жёлтая, до 85% -
 * оранжевая, дальше красная - скоро CLI сожмёт разговор сам.
 */
export const CONTEXT_CALM_SHARE = 0.5
export const CONTEXT_WARNING_SHARE = 0.7
export const CONTEXT_DANGER_SHARE = 0.85

/**
 * Через сколько после «стоп» предложить погасить процесс: CLI иногда не отвечает на
 * остановку, если застрял в долгом вызове. Столько же ждёт панель ACC.
 */
export const FORCE_STOP_AFTER_MS = 8 * SECOND_MS

/** Как часто тикают часы хода в строке «работает · 12s». */
export const TICK_MS = SECOND_MS

/** Сколько строк вывода показывает раскрытая карточка вызова; дальше - «… N more lines». */
export const DETAIL_LIMIT = 60

/**
 * Короче этого строка правки слишком обычна, чтобы по ней искать место в файле:
 * скобка, запятая нашлись бы не там.
 */
export const ANCHOR_MIN_CHARS = 8

/** Размер иконок в строках ленты и в карточках. lucide принимает число, не токен. */
export const ROW_ICON_SIZE = 14
export const ROW_ICON_STROKE = 1.75

/** Почему экран плагинов или /config не смог - словами. */
export const TOOLS_FAILURE_KEYS: Record<ToolsFailure, ParseKeys> = {
  untrusted: 'claudeCode.tools.failures.untrusted',
  'cli-not-found': 'claudeCode.tools.failures.cliNotFound',
  'project-missing': 'claudeCode.tools.failures.projectMissing',
  'process-exited': 'claudeCode.tools.failures.processExited',
  refused: 'claudeCode.tools.failures.refused',
  failed: 'claudeCode.tools.failures.failed',
}

/**
 * Куда ведёт шаг назад из экрана бокового меню. Настройки стоят под Settings, три
 * списка новой вкладки - под New chats, подробности - под своим экраном: возврат сразу
 * к корню потерял бы экран, посреди которого человек был.
 */
export const MENU_PARENT: Record<MenuScreen, MenuScreen> = {
  menu: 'menu',
  history: 'menu',
  plugins: 'menu',
  accounts: 'menu',
  settings: 'menu',
  calmColors: 'settings',
  newChat: 'settings',
  newChatModel: 'newChat',
  newChatEffort: 'newChat',
  newChatMode: 'newChat',
  shareEditor: 'settings',
  pasteCollapse: 'settings',
  claudeConfig: 'settings',
  customModels: 'settings',
}
