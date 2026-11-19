import type { PermissionMode, ConversationOptions } from '@shared/conversation'

import { cliPermissionMode } from '../cli/cli-args'
import type { CliProcess } from '../cli/cli-process'
import { CliReplyError } from '../cli/cli-process'
import { fastModeRequest } from '../panel/fast-mode'
import { toPanelMode } from '../settings/default-mode'
import type { ConversationRuntime } from '../../agents/conversation/conversation-runtime'
import { claudeOf } from './claude-conversation'
import { modeFromReply } from './cli-replies'

const warn = (what: string) => (error: unknown) =>
  console.warn(`[claude] ${what} не принят:`, error)

/**
 * Модель, усилие и режим разговора. Вкладка запоминает их сразу; живому процессу они
 * уходят управляющими запросами, без перезапуска. Процесса нет - он поднимется уже с
 * ними (флаги запуска в spawn.ts).
 */
export const applyOptions = (runtime: ConversationRuntime, options: ConversationOptions): void => {
  const process = claudeOf(runtime).process?.isAlive ? claudeOf(runtime).process : null

  if (options.model !== undefined) {
    runtime.update({ model: options.model })
    process
      ?.control({ subtype: 'set_model', model: options.model ?? 'default' })
      .catch(warn('set_model'))
  }

  if (options.effort !== undefined) {
    runtime.update({ effort: options.effort })
    process
      ?.control({ subtype: 'apply_flag_settings', settings: { effortLevel: options.effort } })
      .catch(warn('effort'))
  }

  // Быстрый режим: просьба - заявкой в слой flag settings; работает ли он, CLI скажет в
  // начале следующего хода (до того прошлый ответ CLI не в счёт).
  if (options.fastMode !== undefined) {
    // Новая просьба - и отказ по прежней причине снова новость: строка FAST встанет опять.
    if (options.fastMode && !runtime.meta.fastMode) claudeOf(runtime).feed.builder.noteFastAsked()

    runtime.update({ fastMode: options.fastMode, fastReport: undefined })
    process?.control(fastModeRequest(options.fastMode)).catch(warn('fastMode'))
  }

  if (options.permissionMode !== undefined) {
    const previous = runtime.meta.permissionMode

    runtime.update({ permissionMode: options.permissionMode })

    if (process) switchMode(runtime, process, options.permissionMode, previous)
  }
}

/**
 * Режим живому процессу (как в ACC). Верим ответу, а не просьбе: CLI возвращает режим,
 * который применил. Отказ (auto не на каждой модели, bypass запрещён организацией) -
 * вкладка возвращается к прежнему режиму, а панель запоминает отказ: Shift+Tab и меню
 * туда больше не ведут. Процесс, ушедший до ответа, - не отказ.
 */
const switchMode = (
  runtime: ConversationRuntime,
  process: CliProcess,
  asked: PermissionMode,
  previous: PermissionMode,
) => {
  const { cli } = claudeOf(runtime)

  if (!cli) return

  const mode = cliPermissionMode(asked, cli.features)

  process
    .control({ subtype: 'set_permission_mode', mode })
    .then((reply) => {
      const applied = toPanelMode(modeFromReply(reply))

      if (applied && runtime.meta.permissionMode === asked)
        runtime.update({ permissionMode: applied })
    })
    .catch((error: unknown) => {
      warn('set_permission_mode')(error)

      if (!(error instanceof CliReplyError)) return
      if (runtime.meta.permissionMode === asked) runtime.update({ permissionMode: previous })

      claudeOf(runtime).host.panel?.modeRefused(runtime, asked)
    })
}
