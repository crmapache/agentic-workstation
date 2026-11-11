import { z } from 'zod'

import { BASE64_PATTERN } from './base64'

/**
 * Что можно попросить с телефона - белый список. Канал пишет агенту, у которого шелл на
 * рабочей машине: всё, чего здесь нет, отказывается, в том числе команда, которой ещё не
 * существует. Нельзя с телефона (решение владельца, строже ACC): терминал и `!`, правка
 * файлов, настройки IDE и провайдеров, аккаунты, коннекторы, пара и сам удалённый доступ,
 * «разрешать всегда», режим bypass и auto, закрытие очереди, удаление worktree и сценариев.
 */

const ID = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/)

/** id разговора - UUID вкладки IDE. */
const CONVERSATION_ID = z.string().regex(/^[A-Za-z0-9-]{1,80}$/)

const PROJECT_KEY = z.string().regex(/^[pr]-[A-Za-z0-9_-]{22}$/)

const TEXT = z.string().max(100_000)

export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const

/** Картинка base64 без `data:`; сообщение с фото тяжелее кадра приходит частями. */
const IMAGE = z.object({
  mediaType: z.enum(IMAGE_TYPES),
  data: z.string().max(3_000_000).regex(BASE64_PATTERN),
})

const IMAGES = z.array(IMAGE).max(6).optional()

export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const

/** Режимы нового разговора с телефона: bypass и auto выбирает только человек за столом. */
export const PHONE_PERMISSION_MODES = ['default', 'acceptEdits', 'plan'] as const

const PROVIDER = z.string().regex(/^[a-z][a-z0-9-]{0,31}$/)

const MODEL = z.string().max(120).nullable()

const DECISION = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('permission'), allow: z.boolean(), message: TEXT.optional() }),
  z.object({
    kind: z.literal('question'),
    answers: z.record(z.string().max(2000), z.string().max(10_000)),
  }),
  z.object({ kind: z.literal('plan'), approve: z.boolean(), feedback: TEXT.optional() }),
])

const QUEUE_ACTION = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('remove'), itemId: ID }),
  z.object({ kind: z.literal('move'), itemId: ID, by: z.int().min(-100).max(100) }),
  z.object({ kind: z.literal('mode'), itemId: ID, afterSuccess: z.boolean() }),
  z.object({ kind: z.literal('stopAfter'), itemId: ID.nullable() }),
  z.object({ kind: z.literal('resume') }),
  z.object({ kind: z.literal('rename'), name: z.string().trim().min(1).max(80) }),
])

const TARGET = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('new'), worktree: z.boolean() }),
  z.object({ kind: z.literal('queue'), queueId: ID }),
])

/** Аргументы каждой команды. Лишние поля отбрасываются, кривые - отказ всей команды. */
export const COMMAND_ARGS = {
  'conversation.send': z.object({ conversationId: CONVERSATION_ID, text: TEXT, images: IMAGES }),
  'conversation.respond': z.object({
    conversationId: CONVERSATION_ID,
    requestId: z.string().min(1).max(200),
    decision: DECISION,
  }),
  'conversation.interrupt': z.object({ conversationId: CONVERSATION_ID }),
  'conversation.new': z.object({
    projectKey: PROJECT_KEY,
    provider: PROVIDER,
    model: MODEL.optional(),
    effort: z.enum(EFFORTS).nullable().optional(),
    permissionMode: z.enum(PHONE_PERMISSION_MODES).optional(),
  }),
  'conversation.rename': z.object({
    conversationId: CONVERSATION_ID,
    title: z.string().trim().min(1).max(100),
  }),
  'conversation.setModel': z.object({ conversationId: CONVERSATION_ID, model: MODEL }),
  'conversation.setEffort': z.object({
    conversationId: CONVERSATION_ID,
    effort: z.enum(EFFORTS).nullable(),
  }),
  'scenarios.shelves': z.object({ projectKey: PROJECT_KEY }),
  'scenarios.start': z.object({
    projectKey: PROJECT_KEY,
    scenarioId: ID,
    scope: z.enum(['project', 'user']),
    inputs: z.record(z.string().max(80), z.string().max(20_000)),
    provider: PROVIDER,
    target: TARGET,
    afterSuccess: z.boolean(),
  }),
  'scenarios.queue': z.object({ queueId: ID, action: QUEUE_ACTION }),
  'scenarios.control': z.object({ runId: ID, action: z.enum(['pause', 'resume', 'stop']) }),
  'scenarios.answer': z.object({ runId: ID, allow: z.boolean(), text: TEXT }),
  'scenarios.tell': z.object({ runId: ID, text: TEXT, images: IMAGES }),
  'scenarios.carryOn': z.object({ runId: ID }),
} as const

export type CommandName = keyof typeof COMMAND_ARGS

export const COMMAND_NAMES = Object.keys(COMMAND_ARGS) as CommandName[]

export type CommandArgs<N extends CommandName> = z.output<(typeof COMMAND_ARGS)[N]>

/** Команда после проверки: имя и аргументы связаны типом. */
export type Command = { [N in CommandName]: { name: N; args: CommandArgs<N> } }[CommandName]

/**
 * Сколько раз в минуту устройство может просить одно и то же. Числа отвечают на вопрос, что
 * успеет телефон в чужих руках: пять ответов на разрешения за десять секунд - обычное утро,
 * пять сообщений за десять секунд - не человек печатает.
 */
export const COMMAND_LIMITS: Readonly<Record<CommandName, number>> = {
  'conversation.send': 10,
  'conversation.respond': 40,
  'conversation.interrupt': 20,
  'conversation.new': 10,
  'conversation.rename': 20,
  'conversation.setModel': 20,
  'conversation.setEffort': 20,
  'scenarios.shelves': 30,
  'scenarios.start': 10,
  'scenarios.queue': 30,
  'scenarios.control': 20,
  'scenarios.answer': 40,
  'scenarios.tell': 10,
  'scenarios.carryOn': 10,
}

/**
 * Что решено не пускать - явно, чтобы новое имя не стало доступным только потому, что про
 * список забыли. Тест держит: ни одно из них не попадает в белый список.
 */
export const REFUSED_COMMANDS: readonly string[] = [
  'conversation.allowAlways',
  'conversation.setMode',
  'conversation.close',
  'conversation.shell',
  'conversation.rewind',
  'scenarios.close',
  'scenarios.delete',
  'scenarios.save',
  'scenarios.worktreeRemove',
  'terminal.run',
  'files.write',
  'settings.set',
  'accounts.use',
  'connectors.add',
  'remote.setEnabled',
  'remote.approve',
  'remote.revoke',
]

/** Сообщение с картинками может прийти частями (см. parts.ts); всё прочее влезает в кадр. */
export const MAY_ARRIVE_IN_PARTS: ReadonlySet<CommandName> = new Set([
  'conversation.send',
  'scenarios.tell',
])

export const isCommandName = (name: unknown): name is CommandName =>
  typeof name === 'string' && Object.hasOwn(COMMAND_ARGS, name)

export type CommandRefusal = 'unknownCommand' | 'badArgs'

/** Имя из белого списка и аргументы по его схеме - или причина отказа. */
export const parseCommand = (
  name: unknown,
  args: unknown,
): { ok: true; command: Command } | { ok: false; code: CommandRefusal } => {
  if (!isCommandName(name)) return { ok: false, code: 'unknownCommand' }

  const parsed = COMMAND_ARGS[name].safeParse(args)

  return parsed.success
    ? { ok: true, command: { name, args: parsed.data } as Command }
    : { ok: false, code: 'badArgs' }
}
