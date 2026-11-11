/**
 * Ответы команд машины: аккаунты провайдера и коннекторы IDE. Секретов, адресов серверов и
 * команд здесь нет вовсе; почта - замаскированной (ADR 0041, «Команды телефона»).
 */

/** Окно лимита: пять часов (session), неделя (weekly), неделя одной модели (model не пуст). */
export type UsageWindowWire = {
  group: string
  model: string
  /** Сколько израсходовано, проценты; больше 100 - доплата. */
  percent: number
  /** Когда окно сбросится (мс); null - сервер не сказал. */
  resetsAt: number | null
}

/**
 * Аккаунт Claude. id пустой - обычный вход Claude Code на машине. email - замаскированный
 * (`mz…e@gmail.com`): отличить свои аккаунты хватает, а целиком адрес с машины не уходит.
 * signedIn null - IDE ещё не спрашивала. usage null - лимиты ещё не узнали или не вошёл.
 */
export type AccountWire = {
  id: string
  alias: string
  email: string
  plan: string
  signedIn: boolean | null
  current: boolean
  /** Лимит отказал аккаунту до этого момента (мс); null - отказа нет. */
  refusedUntil: number | null
  usage: {
    windows: UsageWindowWire[]
    /** Доплата сверх тарифа включена: проценты месячного предела; null - не сказано. */
    extra: number | null
    /** Когда цифры сняты с сервера (мс). */
    fetchedAt: number
  } | null
}

export type AccountsWire = { accounts: AccountWire[] }

/**
 * Коннектор IDE на телефоне: тип, имя и подпись, чей вход (почта - замаскированной), состояние
 * и сколько инструментов включено. Адрес сервера, команда и ключи остаются в IDE.
 */
export type ConnectorWire = {
  id: string
  kind: string
  /** Имя своего типа; у встроенных (Gmail, Notion) - null, телефон зовёт их по kind. */
  name: string | null
  label: string
  account: string | null
  /** connected, signed-out, signing-in, failed, disabled. */
  status: string
  failure: string | null
  enabled: boolean
  tools: number
  toolsOn: number
}

export type ConnectorsWire = { connectors: ConnectorWire[] }
