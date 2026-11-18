import type { PermissionMode } from '@shared/claude'
import type { CarryOnReason } from '@shared/claude-panel'

import type { CliMessage } from '../cli/cli-messages'
import type { CliProcess } from '../cli/cli-process'
import type { ConversationRuntime } from '../../agents/conversation/conversation-runtime'

/**
 * Где служебные возможности панели (panel/) слышат разговор: живые строки CLI раньше
 * ленты, итог хода после того, как разговор его отработал, сообщения, ушедшие в CLI, и
 * выход процесса. Разговор о самих возможностях не знает - только зовёт.
 */
export type PanelHooks = {
  /** Живая строка CLI основного разговора; true - строка панели, ленте её не нести. */
  line: (runtime: ConversationRuntime, message: CliMessage) => boolean
  /** Ход кончился, разговор свой итог отработал (лента, очередь, отложенный перезапуск). */
  afterResult: (runtime: ConversationRuntime, result: CliMessage) => void
  /** Сообщение ушло в CLI; auto - его написала панель, а не человек. */
  said: (runtime: ConversationRuntime, auto: CarryOnReason | null) => void
  /** Процесс разговора закрылся - свой или уже заменённый. */
  exited: (runtime: ConversationRuntime, process: CliProcess) => void
  /** CLI отказался перейти в режим: Shift+Tab и меню больше туда не ведут. */
  modeRefused: (runtime: ConversationRuntime, mode: PermissionMode) => void
  /**
   * Процесс вот-вот поднимется на этом аккаунте: модель вкладки прижимается к каталогу
   * аккаунта (CLI не отказывает в чужой модели на старте, а падает на первом сообщении).
   */
  launching: (runtime: ConversationRuntime, accountId: string) => void
}
