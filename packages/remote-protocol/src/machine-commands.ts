import { z } from 'zod'

import { PROJECT_KEY } from './command-fields'

/** Аккаунт Claude: свой (16 hex) или пустой - обычный вход Claude Code на машине. */
const ACCOUNT_ID = z.string().regex(/^(?:[0-9a-f]{16})?$/)

/** Коннектор IDE - UUID, который дала ему IDE. */
const CONNECTOR_ID = z.string().regex(/^[A-Za-z0-9-]{1,80}$/)

/**
 * Машина целиком, а не один разговор: проекты, аккаунты провайдера и коннекторы IDE.
 *
 * - Открыть недавний проект - окно IDE открывает его вкладкой на столе (только из недавних,
 *   которые IDE назвала сама).
 * - Аккаунт - ответ на «чья подписка платит», а не настройка вроде режима: выбрать другой
 *   вошедший аккаунт посреди вечера, когда пятичасовое окно кончилось, - ровно то, ради чего
 *   канал есть. Выбор перезапускает процессы разговоров (телефон спрашивает «точно?»). Забыть
 *   и выйти - разрушительные, тоже за «точно?». Новый вход и повторный вход открывают
 *   Терминал и браузер на Mac - с дивана их не закончить, они запрещены.
 * - Коннекторы - только чтение и переподключение: добавить, убрать и войти (OAuth в браузере
 *   Mac) - за столом.
 */
export const MACHINE_ARGS = {
  'projects.open': z.object({ projectKey: PROJECT_KEY }),
  'accounts.list': z.object({}),
  'accounts.use': z.object({ accountId: ACCOUNT_ID }),
  'accounts.rename': z.object({ accountId: ACCOUNT_ID, alias: z.string().trim().max(80) }),
  /** Забыть добавленный аккаунт: его хранилище входа уходит с Mac; обычный вход не забывается. */
  'accounts.forget': z.object({ accountId: z.string().regex(/^[0-9a-f]{16}$/) }),
  /** Выйти из обычного входа Claude Code: CLI отзывает вход на всех машинах. */
  'accounts.logout': z.object({}),
  'connectors.list': z.object({}),
  /** Перечитать инструменты у сервиса; пометка «вход пропал» снимается, если ключ ожил. */
  'connectors.reconnect': z.object({ connectorId: CONNECTOR_ID }),
} as const

export const MACHINE_LIMITS: Readonly<Record<keyof typeof MACHINE_ARGS, number>> = {
  'projects.open': 10,
  'accounts.list': 20,
  'accounts.use': 5,
  'accounts.rename': 10,
  'accounts.forget': 3,
  'accounts.logout': 3,
  'connectors.list': 20,
  'connectors.reconnect': 10,
}
