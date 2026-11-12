import { z } from 'zod'

import {
  ID,
  TEXT,
  MODEL,
  QUERY,
  IMAGES,
  EFFORTS,
  ITEM_ID,
  TASK_ID,
  PROVIDER,
  MESSAGE_ID,
  REQUEST_ID,
  SESSION_ID,
  PROJECT_KEY,
  CONVERSATION_ID,
  PHONE_PERMISSION_MODES,
} from './command-fields'

/** Сообщение в очереди разговора - UUID, который дала ему IDE. */
const QUEUED_ID = z.string().regex(/^[A-Za-z0-9-]{1,80}$/)

/** Самый длинный вопрос сбоку: тот же потолок, что у окна IDE (ASIDE_TEXT_LIMIT). */
export const MAX_ASIDE_CHARS = 20_000

const DECISION = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('permission'), allow: z.boolean(), message: TEXT.optional() }),
  z.object({
    kind: z.literal('question'),
    answers: z.record(z.string().max(2000), z.string().max(10_000)),
  }),
  z.object({ kind: z.literal('plan'), approve: z.boolean(), feedback: TEXT.optional() }),
])

/**
 * Разговоры провайдера с телефона. Всё здесь - не шире `conversation.send`, открытого с первого
 * дня: сообщение агенту, у которого шелл на машине, - самая широкая дверь канала. Очередь - то
 * же сообщение, сказанное позже; вопрос сбоку - вопрос без инструментов и без записи в
 * транскрипт; откат - то, что меняет и сообщение, а код откатывается только тот, что писали
 * инструменты агента. Режим разговора («ask», bypass, auto) с телефона не меняется вовсе.
 *
 * Ответ на вопрос несёт его опознание (requestId вопроса CLI): ответ на снятый или сменившийся
 * вопрос IDE отказывает (questionGone), а не кладёт на следующий.
 */
export const CONVERSATION_ARGS = {
  'conversation.send': z.object({ conversationId: CONVERSATION_ID, text: TEXT, images: IMAGES }),
  /** Отложить до конца хода; разговор свободен - уходит сразу, ждать нечего. */
  'conversation.enqueue': z.object({ conversationId: CONVERSATION_ID, text: TEXT, images: IMAGES }),
  'conversation.unqueue': z.object({ conversationId: CONVERSATION_ID, queuedId: QUEUED_ID }),
  /** Переставить отложенное на место toIndex (как перетаскивание в окне IDE). */
  'conversation.moveQueued': z.object({
    conversationId: CONVERSATION_ID,
    queuedId: QUEUED_ID,
    toIndex: z.int().min(0).max(100),
  }),
  /** Отложенное - сейчас: во время хода модель прочтёт его на следующем шаге. */
  'conversation.sendQueued': z.object({ conversationId: CONVERSATION_ID, queuedId: QUEUED_ID }),
  'conversation.respond': z.object({
    conversationId: CONVERSATION_ID,
    requestId: REQUEST_ID,
    decision: DECISION,
  }),
  /** Закрыть вопрос с вариантами, не ответив (как «Dismiss» у карточки панели). */
  'conversation.dismiss': z.object({ conversationId: CONVERSATION_ID, requestId: REQUEST_ID }),
  'conversation.interrupt': z.object({ conversationId: CONVERSATION_ID }),
  /** CLI не ответил на остановку - погасить его процесс (телефон спрашивает «точно?»). */
  'conversation.forceStop': z.object({ conversationId: CONVERSATION_ID }),
  /** Остановить одну задачу разговора - субагента или фоновую команду, не трогая ход. */
  'conversation.stopTask': z.object({ conversationId: CONVERSATION_ID, taskId: TASK_ID }),
  /** «Don't continue»: панель не скажет своих слов после лимита, очередь уйдёт в свой срок. */
  'conversation.cancelCarryOn': z.object({ conversationId: CONVERSATION_ID }),
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
  /** Быстрый режим этого разговора: просьба CLI, настроек машины не пишет. */
  'conversation.setFast': z.object({ conversationId: CONVERSATION_ID, fast: z.boolean() }),
  /**
   * Вопрос сбоку (/btw): askId называет телефон, по нему же отмена. Итог команды - ответ,
   * когда он пришёл (до 11 минут): он уходит только спросившему телефону.
   */
  'conversation.aside': z.object({
    conversationId: CONVERSATION_ID,
    askId: ID,
    question: z.string().trim().min(1).max(MAX_ASIDE_CHARS),
  }),
  'conversation.asideCancel': z.object({ conversationId: CONVERSATION_ID, askId: ID }),
  /** История проекта: открытого или недавнего (список - чтение, открыть - только в открытом). */
  'conversation.history': z.object({ projectKey: PROJECT_KEY, provider: PROVIDER }),
  'conversation.openHistory': z.object({
    projectKey: PROJECT_KEY,
    provider: PROVIDER,
    sessionId: SESSION_ID,
  }),
  'conversation.earlier': z.object({ conversationId: CONVERSATION_ID, before: ITEM_ID }),
  'conversation.image': z.object({
    conversationId: CONVERSATION_ID,
    messageId: ITEM_ID,
    index: z.int().min(0).max(99),
  }),
  /** Поиск по разговорам открытого проекта - индексом IDE, ответ кусками в один кадр. */
  'conversation.search': z.object({ projectKey: PROJECT_KEY, query: QUERY }),
  /**
   * Описанный поиск - модели (`claude -p` только с Grep, Read, Glob в папке разговоров текстом).
   * runId называет телефон: по нему отмена. Итог - когда модель кончила (до пары минут).
   */
  'conversation.searchAi': z.object({
    projectKey: PROJECT_KEY,
    runId: ID,
    query: z.string().trim().min(1).max(4_000),
  }),
  'conversation.searchCancel': z.object({ runId: ID }),
  /** Какие файлы вернёт откат кода к сообщению (ничего не меняет). */
  'conversation.rewindPreview': z.object({
    conversationId: CONVERSATION_ID,
    messageId: MESSAGE_ID,
  }),
  'conversation.rewind': z.object({
    conversationId: CONVERSATION_ID,
    messageId: MESSAGE_ID,
    scope: z.enum(['conversation', 'code', 'both']),
  }),
} as const

/**
 * Сколько раз в минуту. Ответ на разрешение - обычное утро, пять сообщений за десять секунд -
 * не человек печатает. Поиск модели и откат - дорогие и редкие.
 */
export const CONVERSATION_LIMITS: Readonly<Record<keyof typeof CONVERSATION_ARGS, number>> = {
  'conversation.send': 10,
  'conversation.enqueue': 10,
  'conversation.unqueue': 30,
  'conversation.moveQueued': 30,
  'conversation.sendQueued': 20,
  'conversation.respond': 40,
  'conversation.dismiss': 40,
  'conversation.interrupt': 20,
  'conversation.forceStop': 5,
  'conversation.stopTask': 20,
  'conversation.cancelCarryOn': 10,
  'conversation.new': 10,
  'conversation.rename': 20,
  'conversation.setModel': 20,
  'conversation.setEffort': 20,
  'conversation.setFast': 20,
  'conversation.aside': 10,
  'conversation.asideCancel': 20,
  'conversation.history': 20,
  'conversation.openHistory': 10,
  'conversation.earlier': 30,
  'conversation.image': 30,
  'conversation.search': 30,
  'conversation.searchAi': 5,
  'conversation.searchCancel': 10,
  'conversation.rewindPreview': 10,
  'conversation.rewind': 5,
}

/** Тяжелее кадра бывают только сообщения с фото: им можно прийти частями (parts.ts). */
export const CONVERSATION_IN_PARTS = ['conversation.send', 'conversation.enqueue'] as const
