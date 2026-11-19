import { createReadStream } from 'node:fs'
import { stat, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { createInterface } from 'node:readline'

import type { FleetTranscript } from '@shared/conversation-feed'

import { transcriptDirs } from '../history/transcript-paths'
import { isAgentName, MISSING_TRANSCRIPT, FleetTranscriptReader } from './fleet-transcript'

const subdirectories = async (dir: string): Promise<string[]> => {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])

  return entries.filter((entry) => entry.isDirectory()).map((entry) => join(dir, entry.name))
}

const isFile = async (path: string) => (await stat(path).catch(() => null))?.isFile() === true

/**
 * Файл агента флота: `<разговор>/subagents/workflows/<runId>/agent-<agentId>.jsonl`.
 * runId в отчёт не приходит - ищем по имени агента: сначала в папке своего разговора,
 * потом в остальных разговорах проекта (флот, запущенный до продолжения разговора,
 * лежит под тем id, при котором стартовал).
 */
const findAgentFile = async (
  projectPath: string,
  sessionIds: readonly string[],
  agentId: string,
) => {
  for (const projectDir of await transcriptDirs(projectPath)) {
    const own = sessionIds.map((id) => join(projectDir, id))
    const others = (await subdirectories(projectDir)).filter((dir) => !own.includes(dir))

    for (const conversation of [...own, ...others]) {
      for (const run of await subdirectories(join(conversation, 'subagents', 'workflows'))) {
        const file = join(run, `agent-${agentId}.jsonl`)

        if (await isFile(file)) return file
      }
    }
  }

  return null
}

/**
 * Разговор агента флота с диска - только по нажатию: флот из сорока держит сорок
 * транскриптов по мегабайту, а нужен один. Имя проверяется до того, как встанет в путь.
 */
export const loadFleetTranscript = async (
  projectPath: string,
  sessionIds: readonly string[],
  agentId: string,
): Promise<FleetTranscript> => {
  if (!isAgentName(agentId)) return MISSING_TRANSCRIPT

  const file = await findAgentFile(projectPath, sessionIds, agentId)

  if (!file) return MISSING_TRANSCRIPT

  const reader = new FleetTranscriptReader()

  try {
    const lines = createInterface({ input: createReadStream(file, 'utf8'), crlfDelay: Infinity })

    for await (const line of lines) reader.add(line)
  } catch (error) {
    console.warn('[claude] транскрипт агента флота не прочитался:', file, error)

    return MISSING_TRANSCRIPT
  }

  return reader.result()
}
