import { join } from 'node:path'

import { isAvailableIn } from '@shared/connector-availability'
import { MINUTE_MS, SECOND_MS } from '@shared/time-units'

import type { ClaudeService } from '../../claude/claude-service'
import { askStructured } from '../../claude/structured-ask'
import { SERVICE_NAME } from '../../connectors/connector-view'
import type { ConnectorsService } from '../../connectors/connectors-service'
import { TaskAuthor } from '../../tasks/task-author'
import type { AuthorAnswer, TaskAuthorHost } from '../../tasks/task-author'

/** Одно задание - один ответ модели: дольше трёх минут ждать незачем. */
const AUTHOR_MS = 3 * MINUTE_MS

/**
 * Свой таймер CLI - чуть позже сигнала: истёкшее время узнаётся по сигналу и говорится
 * «не успел», а не обрывом процесса без ответа.
 */
const CLI_GRACE_MS = 5 * SECOND_MS

/** Усилие автора: текст задания - не головоломка, а ждать его человек будет с открытым окном. */
const AUTHOR_EFFORT = 'medium'

/** Пол модели автора: на Haiku текст прогона выходит пересказом просьбы, а не инструкцией. */
const authorModel = (model: string) => (!model || /haiku/i.test(model) ? 'sonnet' : model)

/**
 * Автор заданий на Claude Code: разовый `claude -p` с ответом по схеме, без инструментов, в
 * своей пустой папке, на аккаунте панели - его и оплачивает. Модель - новой вкладки, не ниже
 * Sonnet. Коннекторы - включённые и видимые в проекте, с именем сервиса и словами человека.
 */
export const claudeTaskAuthor = (
  claude: ClaudeService,
  connectors: ConnectorsService,
  dataDir: string,
  /** Модель из Settings → AI; пусто - модель новой вкладки (не ниже Sonnet). */
  model: () => string = () => '',
  /** Провайдер служебной работы сейчас не Claude Code - его вопрос; null - спрашивать Claude Code. */
  route: () => TaskAuthorHost['ask'] | null = () => null,
): TaskAuthor =>
  new TaskAuthor({
    ask: async (prompt, schema, signal): Promise<AuthorAnswer> => {
      const routed = route()

      if (routed) return routed(prompt, schema, signal)

      const cli = await claude.cli.locate()

      if (!cli) return { failure: 'noClaude', detail: '' }

      const timeout = AbortSignal.timeout(AUTHOR_MS)
      const prefs = claude.panel.newTabPrefs(claude.settings.prefs)
      const result = await askStructured(
        { ...cli, env: claude.accounts.envFor(cli.env) },
        {
          prompt,
          schema,
          tools: [],
          model: authorModel(model() || (prefs.newTabModel ?? '')),
          effort: AUTHOR_EFFORT,
          cwd: join(dataDir, 'task-author'),
          timeoutMs: AUTHOR_MS + CLI_GRACE_MS,
          signal: AbortSignal.any([signal, timeout]),
        },
      )

      if ('output' in result) return { output: result.output }
      if (result.failure === 'cancelled') {
        return { failure: timeout.aborted ? 'timeout' : 'cancelled', detail: '' }
      }

      return {
        failure: result.failure === 'cli-missing' ? 'noClaude' : 'failed',
        detail: result.detail,
      }
    },
    connectors: (projectPath) =>
      connectors
        .getState()
        .connectors.filter(
          (connector) => connector.enabled && isAvailableIn(connector.availability, projectPath),
        )
        .map((connector) => ({
          server: connector.serverName,
          title: [
            connector.name ?? SERVICE_NAME[connector.kind],
            connector.label,
            connector.account,
          ]
            .filter(Boolean)
            .join(', '),
          description: connector.description,
        })),
    now: () => new Date(),
  })
