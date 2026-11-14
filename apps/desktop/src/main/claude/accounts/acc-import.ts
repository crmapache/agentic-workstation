import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, isAbsolute } from 'node:path'

import type { ImportableAccount } from '@shared/claude-accounts'

import { isRecord, stringField, recordsField } from '../cli/cli-messages'
import type { StoredAccount } from './account-store'
import { accountKey } from './identity-probe'

/** Аккаунт ACC: что показать, где его хранилище и организация (у ACC записи её несут). */
export type AccAccount = ImportableAccount & { drawer: string; orgUuid: string }

/** Реестр amazing-claude-code: общий на машину, мы его только читаем. */
const ACC_REGISTRY = join(homedir(), '.amazing-claude-code', 'accounts.json')

/** Аккаунты ACC из его реестра. Черновики (идёт вход) и записи без хранилища - мимо. */
export const parseAccAccounts = (value: unknown): AccAccount[] =>
  (isRecord(value) ? recordsField(value, 'accounts') : [])
    .map((account) => ({
      sourceId: stringField(account, 'id'),
      drawer: stringField(account, 'storeDir'),
      alias: stringField(account, 'alias'),
      email: stringField(account, 'email'),
      orgUuid: stringField(account, 'orgUuid'),
      plan: stringField(account, 'plan'),
    }))
    .filter(
      (account) =>
        account.sourceId && !account.sourceId.startsWith('pending-') && isAbsolute(account.drawer),
    )

/**
 * Аккаунты, заведённые в amazing-claude-code: их хранилища входа можно взять как есть,
 * без повторного входа. Нет ACC или реестр не читается - пусто.
 */
export const readAccAccounts = async (): Promise<AccAccount[]> => {
  try {
    return parseAccAccounts(JSON.parse(await readFile(ACC_REGISTRY, 'utf8')) as unknown)
  } catch {
    return []
  }
}

/** Куда перевести запись IDE: id записи и хранилище ACC, в котором её аккаунт живёт теперь. */
export type AccMove = { id: string; drawer: string }

type FollowedRecord = Pick<StoredAccount, 'id' | 'drawer' | 'email' | 'orgUuid' | 'external'>

/**
 * Аккаунты ACC, которые IDE взяла, но ACC увёл в новое хранилище: повторный вход в ACC кладёт
 * аккаунт в новую папку, а старую бросает и чистит. Запись IDE на брошенной папке выглядела бы
 * вышедшей, а тот же аккаунт ACC предлагался бы взять второй раз. Аккаунт узнаётся по почте и
 * организации (accountKey); запись без организации, хранилище, которое ACC ещё ведёт, и папка,
 * которую уже держит другая запись, - не трогаются.
 */
export const accMoves = (
  records: readonly FollowedRecord[],
  acc: readonly AccAccount[],
): AccMove[] => {
  const accDrawers = new Set(acc.map((account) => account.drawer))
  const taken = new Set(records.map((record) => record.drawer))

  return records.flatMap((record) => {
    if (!record.external || !record.orgUuid || accDrawers.has(record.drawer)) return []

    const key = accountKey(record.email, record.orgUuid)
    const target = acc.find(
      (account) =>
        account.orgUuid &&
        accountKey(account.email, account.orgUuid) === key &&
        !taken.has(account.drawer),
    )

    if (!target) return []

    taken.add(target.drawer)

    return [{ id: record.id, drawer: target.drawer }]
  })
}

/**
 * Аккаунты ACC, которые можно взять: нет их хранилища среди записей IDE и нет того же аккаунта
 * (почта и организация) - ни записью, ни обычным входом. Иначе «Add here» завёл бы дубль.
 */
export const importableOf = (
  acc: readonly AccAccount[],
  records: readonly Pick<StoredAccount, 'drawer' | 'email' | 'orgUuid'>[],
  defaultKey: string | null,
): AccAccount[] => {
  const drawers = new Set(records.map((record) => record.drawer))
  const keys = new Set(
    records
      .filter((record) => record.orgUuid)
      .map((record) => accountKey(record.email, record.orgUuid)),
  )

  if (defaultKey) keys.add(defaultKey)

  return acc.filter(
    (account) =>
      !drawers.has(account.drawer) &&
      !(account.orgUuid && keys.has(accountKey(account.email, account.orgUuid))),
  )
}
