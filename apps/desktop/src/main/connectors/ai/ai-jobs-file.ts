import { z } from 'zod'

import type { AiJob } from '@shared/connector-spec'
import { MCP_AUTHS } from '@shared/connectors'

import { specSchema } from '../kinds/http/http-spec'

/** Сервер из Claude Code, как его запомнила работа: адрес и команда - уже с маской. */
const candidateSchema = z.object({
  key: z.string(),
  name: z.string(),
  serverName: z.string(),
  kind: z.enum(['mcp', 'command']),
  target: z.string(),
  scope: z.enum(['user', 'local', 'project']),
  projectPath: z.string().nullable(),
  needsSignIn: z.boolean(),
  blocked: z.enum(['taken', 'duplicate', 'bad-name']).nullable(),
  pending: z.boolean(),
})

const proposalSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('http'), spec: specSchema, dropped: z.array(z.string()) }),
  z.object({ kind: z.literal('mcp'), url: z.string(), auth: z.enum(MCP_AUTHS) }),
  z.object({ kind: z.literal('existing'), candidate: candidateSchema }),
])

const storedJobSchema = z.object({
  id: z.string().min(1),
  /** Разговор CLI работы: под ним он продолжается после перезапуска IDE. */
  sessionId: z.string().min(1),
  /** Разговор записан на диск: следующее слово - продолжение (`--resume`), а не новый. */
  saved: z.boolean(),
  request: z.object({ service: z.string(), goal: z.string(), docsUrl: z.string() }),
  createdAt: z.number(),
  status: z.enum(['working', 'ready', 'asking', 'stopped', 'failed']),
  message: z.string(),
  proposal: proposalSchema.nullable(),
  error: z.enum(['cli-missing', 'timeout', 'invalid', 'failed']).nullable(),
  detail: z.string(),
})

export type StoredAiJob = z.infer<typeof storedJobSchema>

export type StoredAiJobs = { jobs: StoredAiJob[] }

/**
 * Работы ИИ с диска (ADR 0050). Запись, которая не разобралась, теряется одна, а не все.
 * Ход, который шёл при выходе из IDE, не продолжается сам: процесса уже нет - работа
 * встаёт остановленной, и человек продолжит её словом.
 */
export const parseStoredAiJobs = (value: unknown): StoredAiJob[] => {
  const jobs = z.object({ jobs: z.array(z.unknown()) }).safeParse(value)

  if (!jobs.success) return []

  return jobs.data.jobs.flatMap((raw) => {
    const parsed = storedJobSchema.safeParse(raw)

    if (!parsed.success) return []

    return [
      parsed.data.status === 'working'
        ? { ...parsed.data, status: 'stopped' as const }
        : parsed.data,
    ]
  })
}

/** Работа для диска: шаг идущего хода не хранится - после перезапуска его нет. */
export const storedJob = (job: AiJob, sessionId: string, saved: boolean): StoredAiJob => {
  const { activity: _activity, ...kept } = job

  return { ...kept, sessionId, saved }
}
