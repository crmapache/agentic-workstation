import { z } from 'zod'

/**
 * API облака IDE (ADR 0102): сервер хранит записи аккаунта шифром и ничего в них не читает.
 * Запись - id и непрозрачный blob; версия (rev) - счётчик аккаунта, растёт с каждой принятой
 * записью. Запись принимается, только если IDE правила ту версию, что лежит на сервере
 * (baseRev): иначе IDE сначала забирает свежую, сливает у себя и шлёт снова.
 */

/** Адрес облака по умолчанию; IDE и проверки могут подставить свой. */
export const CLOUD_URL = 'https://agentic-workstation-cloud.mzpizote.com'

/** id записи выбирает IDE: случайный, без смысла для сервера. */
export const RECORD_ID = /^[A-Za-z0-9_-]{8,64}$/

/** Потолок одной записи шифром (base64url): карточка с длинным описанием влезает с запасом. */
export const MAX_BLOB_LENGTH = 96 * 1024

/** Сколько записей уходит одним запросом. */
export const MAX_PUSH_RECORDS = 200

/** Потолок тела запроса записи: IDE режет пачку и по числу, и по размеру. */
export const MAX_PUSH_BYTES = 4 * 1024 * 1024

/** Сколько записей отдаёт одна страница забора. */
export const PULL_PAGE = 500

/** Дольше этого сервер не держит забор без перемен (секунды). */
export const MAX_WAIT_SECONDS = 25

/** Потолок записей одного аккаунта: защищает сервер от бесконечного роста. */
export const MAX_ACCOUNT_RECORDS = 200_000

const BLOB = /^[A-Za-z0-9_-]+$/

export const pushRecordSchema = z.object({
  id: z.string().regex(RECORD_ID),
  baseRev: z.number().int().min(0),
  blob: z.string().min(1).max(MAX_BLOB_LENGTH).regex(BLOB),
})

export const pushRequestSchema = z.object({
  records: z.array(pushRecordSchema).min(1).max(MAX_PUSH_RECORDS),
})

export type PushRecord = z.infer<typeof pushRecordSchema>
export type PushRequest = z.infer<typeof pushRequestSchema>

/**
 * Итог записи: принята с новой версией или отказ - на сервере уже другая версия (current),
 * её надо забрать и слить.
 */
export type PushResult =
  { id: string; ok: true; rev: number } | { id: string; ok: false; current: number }

export type PushResponse = { rev: number; results: PushResult[] }

export type PulledRecord = { id: string; rev: number; blob: string }

/** Страница забора: записи с версией больше since по порядку; more - есть ещё страница. */
export type PullResponse = { rev: number; records: PulledRecord[]; more: boolean }

/** Сведения сервера: проверка, что адрес - наше облако, и версия протокола. */
export type CloudInfo = { service: 'agentic-workstation-cloud'; protocol: 1 }

export type CloudErrorCode =
  | 'bad-request'
  | 'unsigned'
  | 'bad-signature'
  | 'not-found'
  | 'too-large'
  | 'account-full'
  | 'rate-limited'
  | 'server'

/** Ошибка API: код для IDE и слова для журнала. */
export type CloudError = { error: CloudErrorCode; message: string }
