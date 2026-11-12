import { rm, mkdir, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'

import type { ClaudeService } from '../claude-service'
import { CliProcess } from '../cli/cli-process'
import { makeThumbnail } from '../images/thumbnail'
import type { OpenAiChat } from '../../connectors/ai/ai-chat'
import { DeferredProcess } from '../../providers/claude/deferred-process'
import { ConnectorChat } from './connector-chat'
import { connectorChatArgs } from './connector-chat-args'
import { INSTRUCTIONS_DIR } from './connector-chat.constants'

/**
 * Разговоры о новых коннекторах на Claude Code (ADR 0050): на аккаунте панели, в своей пустой
 * папке - без хуков и CLAUDE.md чужого проекта, правила - файлом рядом (пишется перед каждым
 * подъёмом процесса, уходит с разговором). Модуль коннекторов Claude Code не видит: он
 * получает просто «открыть разговор».
 */
export const connectorChats =
  (claude: ClaudeService, cwd: string): OpenAiChat =>
  (options, events) => {
    const instructionsFile = join(cwd, INSTRUCTIONS_DIR, `${options.sessionId}.md`)

    return new ConnectorChat(
      options,
      {
        spawn: (resume, wires) =>
          new DeferredProcess(async (wanted) => {
            const cli = await claude.cli.locate()

            if (!cli) {
              wires.onMissing()

              return null
            }

            await mkdir(dirname(instructionsFile), { recursive: true })
            await writeFile(instructionsFile, options.instructions, { mode: 0o600 })

            if (!wanted()) return null

            const launch = {
              sessionId: options.sessionId,
              resume,
              schema: options.schema,
              instructionsFile,
            }

            return new CliProcess(
              {
                binary: cli.binary,
                args: connectorChatArgs(launch, cli.features),
                cwd,
                env: claude.accounts.envFor(cli.env),
              },
              wires,
            )
          }, wires),
        load: (feed) => feed.ensureLoaded(cwd, options.sessionId, null),
        thumbnail: makeThumbnail,
        forget: () =>
          rm(instructionsFile, { force: true }).catch((error: unknown) => {
            console.warn('[connectors] правила разговора не удалились', error)
          }),
      },
      events,
    )
  }
