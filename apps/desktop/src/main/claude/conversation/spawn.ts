import { stat } from 'node:fs/promises'

import { buildLaunchArgs } from '../cli/cli-args'
import type { ClaudeCli } from '../cli/cli-locator'
import { CliProcess } from '../cli/cli-process'
import { CLI_ENV_OVERRIDES, CHECKPOINTS_VARIABLE } from '../cli/cli.constants'
import type { Environment } from '../cli/shell-env'
import { fileCheckpointing } from '../config/config-files'
import { releasedBriefing } from '../history/released-heads'
import { findTranscript } from '../history/transcript-paths'
import { fastModeRequest } from '../panel/fast-mode'
import { repositoryOverrides } from '../settings/account-override'
import type { ConnectorsLaunch, ConversationRuntime } from './conversation-runtime'

/**
 * Окружение процесса разговора. Копии файлов (откат кода) - только если человек их не
 * выключил настройкой `checkpoints`: так и терминал, и ACC; выключенная - переменной нет
 * вовсе, даже пришедшей из оболочки.
 */
const conversationEnv = (env: Environment, checkpoints: boolean): Environment =>
  Object.fromEntries(
    Object.entries({ ...env, ...CLI_ENV_OVERRIDES }).filter(
      ([name]) => checkpoints || name !== CHECKPOINTS_VARIABLE,
    ),
  )

/**
 * Коннекторы IDE для нового процесса. Конфиг не записался (диск полон, нет прав) - процесс
 * поднимается без них, а лента говорит об этом строкой: разговор важнее коннекторов. Процесс
 * сразу назван разговором (id вкладки): сессия браузера переживает смену процессов разговора.
 */
export const connectorsLaunch = async (
  runtime: ConversationRuntime,
): Promise<ConnectorsLaunch | null> => {
  const launch = await runtime.host.mcpConfig(runtime.meta.projectPath).catch((error: unknown) => {
    console.warn('[claude] конфиг коннекторов не записан', error)
    runtime.feed.builder.addNotice('connectors-missing', '')

    return null
  })

  launch?.own({ conversationId: runtime.meta.id, workDir: runtime.meta.projectPath })

  if (launch) runtime.connectors = launch

  return launch
}

/**
 * Процесс CLI для разговора; null - папки проекта больше нет. Транскрипт сессии уже
 * есть - продолжить её (--resume), нет - начать с нашим id (--session-id), а
 * нерождённый форк - ответвить от источника: так id известен до первого ответа CLI, и
 * разговор переживёт перезапуск, даже если оборвался на первом же ходе.
 */
export const spawnConversationProcess = async (
  runtime: ConversationRuntime,
  cli: ClaudeCli,
): Promise<CliProcess | null> => {
  const { meta } = runtime
  const info = await stat(meta.projectPath).catch(() => null)

  // Папку проекта удалили или переименовали, пока он открыт: CLI упал бы с ENOENT.
  if (!info?.isDirectory()) {
    runtime.update({ error: 'project-missing' })

    return null
  }

  const resume = (await findTranscript(meta.projectPath, meta.sessionId)) !== null

  // Модель - к тому, что аккаунт умеет, до подъёма: CLI не отказывает в чужой модели на
  // старте, а падает на первом сообщении. Аргументы ниже читают её уже исправленной.
  runtime.host.panel?.launching(runtime, runtime.host.accountId())

  const checkpoints = await fileCheckpointing(meta.projectPath)
  const connectors = await connectorsLaunch(runtime)
  let process: CliProcess

  try {
    const args = buildLaunchArgs(
      {
        sessionId: meta.sessionId,
        resume,
        model: runtime.meta.model,
        effort: meta.effort,
        permissionMode: meta.permissionMode,
        fork: meta.fork,
        mcpConfig: connectors?.path ?? null,
        extraBriefing: releasedBriefing(meta.sessionId),
      },
      cli.features,
    )

    process = new CliProcess(
      {
        binary: cli.binary,
        args,
        cwd: meta.projectPath,
        env: conversationEnv(cli.env, checkpoints),
      },
      {
        onMessage: (message) => runtime.handleMessage(process, message),
        onControlRequest: (request) => runtime.handleControlRequest(process, request),
        onExit: (code, stderrTail) => {
          // Процесс кончился - его ключ шлюза и процессы команд больше не нужны.
          connectors?.release()
          runtime.handleExit(process, code, stderrTail)
          runtime.host.panel?.exited(runtime, process)
        },
      },
    )
  } catch (error) {
    connectors?.release()
    throw error
  }

  // Быстрый режим ездит с разговором: просьба - первой строкой, CLI берёт её до первого
  // сообщения (аргументом нельзя - это JSON, а кавычки в аргументах запрещены).
  if (meta.fastMode) {
    process.control(fastModeRequest(true)).catch(() => undefined)
  }

  // CLI кладёт `env` репозитория поверх окружения процесса: выбранный в панели аккаунт
  // молча не в деле - лента говорит об этом строкой SETTINGS. На обычном входе это просто
  // то, как устроен проект (как в ACC).
  if (runtime.host.accountId() !== '') {
    runtime.feed.builder.noteOutranked(await repositoryOverrides(meta.projectPath))
  }

  return process
}
