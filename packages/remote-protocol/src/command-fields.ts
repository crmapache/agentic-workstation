import { z } from 'zod'

import { BASE64_PATTERN } from './base64'
import {
  MAX_FILES,
  MAX_IMAGES,
  MAX_TEXT_CHARS,
  MAX_IMAGES_CHARS,
  MAX_FILE_NAME_CHARS,
} from './message-size'
import { PROJECT_KEY_PATTERN } from './project-key'

/**
 * Поля команд телефона, общие для всех областей (разговоры, сценарии, машина). Каждое - узкое:
 * id без путей и разделителей, тексты с потолком, перечисления только из того, что знает и окно
 * IDE (незнакомое значение - отказ всей команды).
 */

/** id очередей, элементов, прогонов, часов и того, что телефон называет сам (вопрос сбоку). */
export const ID = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/)

/** id разговора - UUID вкладки IDE. */
export const CONVERSATION_ID = z.string().regex(/^[A-Za-z0-9-]{1,80}$/)

export const PROJECT_KEY = z.string().regex(PROJECT_KEY_PATTERN)

/**
 * id прошлого разговора у провайдера: UUID сессии Claude Code, id потока Codex, `ses_…` сессии
 * OpenCode. Без разделителей путей.
 */
export const SESSION_ID = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/)

/** id элемента ленты - каким его назвала IDE: телефон только возвращает его обратно. */
export const ITEM_ID = z.string().min(1).max(200)

/**
 * id сообщения человека в разговоре (по нему откат): UUID строки транскрипта Claude Code или
 * сообщения, отправленного из IDE, у разговора OpenCode из его журнала - `msg_…` OpenCode.
 */
export const MESSAGE_ID = z
  .string()
  .regex(
    /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|msg_[A-Za-z0-9]{1,76})$/i,
  )

/** Вопрос CLI, на который отвечают: его id управляющего запроса. */
export const REQUEST_ID = z.string().min(1).max(200)

/** Задача CLI (субагент, фоновая команда): имя у CLI, им её останавливают. */
export const TASK_ID = z.string().regex(/^[\w-]{1,128}$/)

export const TEXT = z.string().max(MAX_TEXT_CHARS)

export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const

/** Картинка base64 без `data:`; сообщение с фото тяжелее кадра приходит частями. */
const IMAGE = z.object({
  mediaType: z.enum(IMAGE_TYPES),
  data: z.string().max(MAX_IMAGES_CHARS).regex(BASE64_PATTERN),
})

/** Фото сообщения - числом и весом вместе: то же число, что у телефона (message-size.ts). */
export const IMAGES = z
  .array(IMAGE)
  .max(MAX_IMAGES)
  .refine(
    (images) => images.reduce((sum, image) => sum + image.data.length, 0) <= MAX_IMAGES_CHARS,
    'images over the message size',
  )
  .optional()

/**
 * Файл сообщения, не картинка (PDF, таблица, текст): имя и base64. IDE пишет его в свой каталог
 * вставок и ставит в текст ссылкой «@путь» - так же, как документ, вставленный в поле IDE: пути на
 * телефоне у файла нет, а модель читает файл с диска машины.
 */
const FILE = z.object({
  name: z.string().trim().min(1).max(MAX_FILE_NAME_CHARS),
  data: z.string().min(1).max(MAX_IMAGES_CHARS).regex(BASE64_PATTERN),
})

/** Файлы сообщения - числом и весом; вместе с фото их держит MAX_MESSAGE_BYTES готового JSON. */
export const FILES = z
  .array(FILE)
  .max(MAX_FILES)
  .refine(
    (files) => files.reduce((sum, file) => sum + file.data.length, 0) <= MAX_IMAGES_CHARS,
    'files over the message size',
  )
  .optional()

/**
 * Уровни усилия всех провайдеров IDE от слабого к сильному (ADR 0083): у Claude Code - low…max, у
 * Codex - ещё minimal и ultra, у открытых моделей - свои у каждой модели. Какие есть у разговора,
 * IDE говорит списком его провайдера (ProviderCaps.efforts), а уровень не его провайдера она
 * отказывает. Старый телефон знал только уровни Claude и прочие просто не показывает.
 */
export const EFFORTS = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'] as const

/**
 * Режимы разрешений разговора - режимы меню MODE окна IDE у всех провайдеров (ADR 0076, 0083):
 * readOnly - у Codex и открытых моделей, auto - только у Claude Code. Какие есть у разговора, IDE
 * говорит списком его провайдера (ProviderCaps.permissionModes). Спаренный телефон и так отвечает
 * на каждый вопрос разрешения, режим не шире этого. Доступен ли режим разговору (не его
 * провайдера, bypass под запретом настроек, auto, от которого CLI отказался), решает IDE - тем же
 * правилом, что у окна. dontAsk нет и у окна - его не выразить и здесь.
 */
export const PERMISSION_MODES = [
  'default',
  'acceptEdits',
  'readOnly',
  'plan',
  'auto',
  'bypassPermissions',
] as const

export const PROVIDER = z.string().regex(/^[a-z][a-z0-9-]{0,31}$/)

export const MODEL = z.string().max(120).nullable()

/** Полка сценария: проектная или личная. */
export const SCOPE = z.enum(['project', 'user'])

/** Ответы на вопросы сценария перед запуском: имя вопроса - ответ. */
export const INPUTS = z.record(z.string().max(80), z.string().max(20_000))

/**
 * Состояние прогона, для которого нарисована кнопка. Пауза и продолжение меняются местами:
 * «продолжить», нажатое на устаревшем экране уже идущего прогона, - не просьба человека.
 */
export const SEEN_RUN_STATES = ['starting', 'running', 'paused', 'blocked'] as const

/** Набранный запрос поиска: строка поля, а не вставленный лог. */
export const QUERY = z.string().trim().min(1).max(2_000)
