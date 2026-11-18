import type { ModelInfo, ConversationOptions } from '@shared/claude'
import { losesFastMode } from '@shared/claude-fast-mode'

import type { CliMessage } from '../cli/cli-messages'
import { isRecord, recordField, stringField } from '../cli/cli-messages'
import type { CliProcess } from '../cli/cli-process'
import { claudeOf } from '../conversation/claude-conversation'
import { MODEL_FALLBACK_SUBTYPES } from '../feed/feed.constants'
import type { ConversationRuntime } from '../../agents/conversation/conversation-runtime'
import { fastReportOf } from './fast-mode'
import type { ModelEvent, ModelWatchState } from './model-watch'
import { NO_WATCH, watchPicked, watchSigned, watchRequest, watchFellBack } from './model-watch'

/** Модель настоящая, а не служебная метка CLI («<synthetic>» у заглушки). */
const realModel = (model: string) => (model && !model.startsWith('<') ? model : '')

/** Вернулся вызов инструмента: агент идёт к модели с его результатом - это новый запрос. */
const returnsTool = (message: CliMessage) => {
  const content = recordField(message, 'message')['content']

  return (
    Array.isArray(content) &&
    content.some((block: unknown) => isRecord(block) && block['type'] === 'tool_result')
  )
}

/**
 * Модель и быстрый режим разговора (как в ACC): что CLI говорит о быстром режиме, дошёл
 * ли выбор модели и не сменил ли её CLI сам - по живым строкам основного потока. Итог -
 * в поля вкладки (fastReport, modelNote) и строкой MODEL в ленте.
 */
export class ModelDesk {
  private readonly watches = new WeakMap<ConversationRuntime, ModelWatchState>()
  /** Процесс, чьи подписи сейчас в счёте вкладки. */
  private readonly owners = new WeakMap<ConversationRuntime, CliProcess | null>()

  constructor(private readonly catalog: () => readonly ModelInfo[]) {}

  /** Живая строка основного потока. */
  observe(runtime: ConversationRuntime, message: CliMessage): void {
    // Первая строка нового процесса: подписи старого к нему не относятся - он поднят с
    // выбором вкладки, и его первая подпись не «смена модели».
    if (this.owners.get(runtime) !== claudeOf(runtime).process) {
      this.owners.set(runtime, claudeOf(runtime).process)
      this.forgetProcess(runtime)
    }

    if (message['parent_tool_use_id']) return

    const isInit = message.type === 'system' && message.subtype === 'init' && !message['task_id']

    if (isInit || message.type === 'result') this.noteFast(runtime, message)
    if (isInit || (message.type === 'user' && returnsTool(message))) {
      this.set(runtime, watchRequest(this.watchOf(runtime)), null)
    }

    if (
      message.type === 'system' &&
      message.subtype &&
      MODEL_FALLBACK_SUBTYPES.has(message.subtype)
    ) {
      const from = realModel(stringField(message, 'originalModel'))
      const to = realModel(stringField(message, 'fallbackModel'))

      if (from && to) this.set(runtime, watchFellBack(this.watchOf(runtime), from, to), null)
    }

    if (message.type === 'assistant') {
      const named = realModel(stringField(recordField(message, 'message'), 'model'))

      if (named) this.set(runtime, ...watchSigned(this.watchOf(runtime), named))
    }
  }

  /**
   * Человек меняет модель или усилие: выбор модели ждёт подтверждения подписью, модель
   * без быстрого режима его снимает (обратно он сам не включается, как в терминале).
   */
  picked(runtime: ConversationRuntime, options: ConversationOptions): ConversationOptions {
    if (options.model === undefined) return options

    const models = this.catalog()
    const pick = options.model ?? 'default'
    const resolved = models.find((model) => model.value === pick)?.resolved ?? ''

    this.set(runtime, watchPicked(this.watchOf(runtime), pick, resolved), null)

    return runtime.meta.fastMode &&
      options.fastMode === undefined &&
      losesFastMode(models, options.model)
      ? { ...options, fastMode: false }
      : options
  }

  /** Процесс сменился: что знали о подписях старого - прочь, просьба быстрого режима остаётся. */
  private forgetProcess(runtime: ConversationRuntime) {
    this.watches.delete(runtime)

    if (runtime.meta.modelNote) runtime.update({ modelNote: undefined })
  }

  private noteFast(runtime: ConversationRuntime, message: CliMessage) {
    const report = fastReportOf(message)
    const shown = runtime.meta.fastReport

    if (report && (report.state !== shown?.state || report.reason !== shown.reason)) {
      runtime.update({ fastReport: report })
    }
  }

  private watchOf(runtime: ConversationRuntime) {
    return this.watches.get(runtime) ?? NO_WATCH
  }

  private set(runtime: ConversationRuntime, state: ModelWatchState, event: ModelEvent) {
    this.watches.set(runtime, state)

    if (runtime.meta.modelNote !== state.note) runtime.update({ modelNote: state.note })
    if (!event) return

    const { builder } = claudeOf(runtime).feed

    if (event.kind === 'stuck')
      builder.addNotice('model-stuck', event.picked, { subject: event.running })
    else builder.addNotice('model-swap', event.from, { subject: event.to })

    claudeOf(runtime).feed.schedule()
  }
}
