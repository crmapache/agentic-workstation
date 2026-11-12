import { z } from 'zod'

import type { AiProposal } from '@shared/connector-spec'
import type { ImportCandidate } from '@shared/connectors'
import { MCP_AUTHS } from '@shared/connectors'

import { hasSecretParts } from '../connector-url'
import { specSchema, parseAiSpec } from '../kinds/http/http-spec'

const OUTCOMES = ['existing', 'mcp', 'http', 'none'] as const

/**
 * Официальный MCP-сервер, который ИИ нашёл в документации: только https и без ключа в адресе -
 * ключ человек вводит сам, а ИИ его не видит.
 */
const mcpSchema = z.object({
  url: z
    .string()
    .max(500)
    .refine((value) => /^https:\/\//i.test(value) && !hasSecretParts(value), 'https, no secrets'),
  auth: z.enum(MCP_AUTHS),
})

/** Ответ ИИ за ход: что предлагает добавить и что говорит человеку. */
const answerSchema = z.object({
  outcome: z.enum(OUTCOMES),
  message: z.string(),
  existing: z.string().optional(),
  mcp: mcpSchema.optional(),
  spec: specSchema.optional(),
})

/** Разбирается мягче схемы: негодные инструменты описания выбрасывает parseAiSpec. */
const looseAnswer = z.object({
  outcome: z.enum(OUTCOMES),
  message: z.string(),
  existing: z.unknown().optional(),
  mcp: z.unknown().optional(),
  spec: z.unknown().optional(),
})

/**
 * Схема ответа для CLI. draft-07, а не 2020-12 по умолчанию у zod: CLI проверяет схему
 * валидатором, который знает только draft-07, и 2020-12 отвергает целиком.
 */
export const ANSWER_JSON_SCHEMA = z.toJSONSchema(answerSchema, { target: 'draft-7' })

/** Что вышло из ответа: предложение, ответ без него (вопрос, «не выйдет») или негодное. */
export type AnswerReading =
  | { kind: 'proposal'; message: string; proposal: AiProposal }
  | { kind: 'none'; message: string }
  | { kind: 'invalid'; message: string; detail: string }

/**
 * Сервер из Claude Code по имени, которое назвал ИИ. Имя ищется без регистра; из одинаковых
 * (свой и проектный) - тот, что можно взять.
 */
const candidateNamed = (name: string, candidates: readonly ImportCandidate[]) => {
  const named = candidates.filter((item) => item.name.toLowerCase() === name.trim().toLowerCase())

  return named.find((item) => !item.blocked) ?? named[0] ?? null
}

const proposalOf = (
  answer: z.infer<typeof looseAnswer>,
  candidates: readonly ImportCandidate[],
): { proposal: AiProposal } | { detail: string } => {
  if (answer.outcome === 'existing') {
    const name = typeof answer.existing === 'string' ? answer.existing : ''
    const candidate = candidateNamed(name, candidates)

    return candidate
      ? { proposal: { kind: 'existing', candidate } }
      : { detail: `No server named "${name}" in the Claude Code settings.` }
  }

  if (answer.outcome === 'mcp') {
    const mcp = mcpSchema.safeParse(answer.mcp)

    return mcp.success
      ? { proposal: { kind: 'mcp', url: mcp.data.url, auth: mcp.data.auth } }
      : { detail: z.prettifyError(mcp.error) }
  }

  const parsed = parseAiSpec(answer.spec)

  return parsed.spec
    ? { proposal: { kind: 'http', spec: parsed.spec, dropped: parsed.dropped } }
    : { detail: parsed.detail }
}

/**
 * Ответ хода по схеме - в то, что видит человек. Предложение проверяется теми же правилами,
 * что при добавлении: описание - specSchema, адрес MCP - https без ключа, сервер Claude Code -
 * по списку, который ИИ видел. Не прошло - invalid с пояснением, разговор продолжается.
 */
export const readAnswer = (
  output: unknown,
  candidates: readonly ImportCandidate[],
): AnswerReading => {
  const answer = looseAnswer.safeParse(output)

  if (!answer.success) {
    return { kind: 'invalid', message: '', detail: z.prettifyError(answer.error) }
  }

  const { message } = answer.data

  if (answer.data.outcome === 'none') return { kind: 'none', message }

  const read = proposalOf(answer.data, candidates)

  return 'proposal' in read
    ? { kind: 'proposal', message, proposal: read.proposal }
    : { kind: 'invalid', message, detail: read.detail.slice(0, 2000) }
}
