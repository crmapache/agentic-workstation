import { it, expect, describe } from 'vitest'

import type { CodexAccount } from '../catalog/catalog-shapes'
import type { CodexCatalog } from '../catalog/codex-catalog'
import { CodexAccountDesk } from './codex-account-desk'
import type { CodexAccounts } from './codex-accounts'

/** Поддельные аккаунты: список в памяти. */
const fakeAccounts = () => {
  const list = [{ id: '', alias: '', email: 'a@x', plan: 'plus' }]
  let current = ''
  let next = 0

  return {
    get current() {
      return current
    },
    get list() {
      return list
    },
    find: (id: string) => list.find((row) => row.id === id),
    create: () => Promise.resolve(`${(next += 1)}`.padStart(16, '0')),
    remember: (id: string, facts: { email: string; plan: string }) => {
      const row = list.find((item) => item.id === id)

      if (row) Object.assign(row, facts)
      else list.push({ id, alias: '', ...facts })
    },
    select: (id: string) => {
      if (list.some((row) => row.id === id)) current = id
    },
    forget: (id: string) => {
      list.splice(
        list.findIndex((row) => row.id === id),
        1,
      )
      if (current === id) current = ''

      return Promise.resolve()
    },
    discard: () => Promise.resolve(),
  } as unknown as CodexAccounts
}

/** Что делали каталоги: «id действие»; у каталога аккаунта в работе id - current. */
type Log = string[]

/**
 * Каталог, вход в который кончается сам (instant) или ждёт: вошёл тот, кто назван.
 */
const fakeCatalog = (
  id: string,
  who: CodexAccount,
  notice: (method: string, params: unknown) => void,
  log: Log,
  instant = true,
) =>
  ({
    startSignIn: () => {
      if (instant) {
        setTimeout(() => notice('account/login/completed', { loginId: 'l', success: true }), 0)
      }

      return Promise.resolve({ loginId: 'l', authUrl: 'https://auth' })
    },
    cancelSignIn: () => {
      log.push(`${id} cancel`)

      return Promise.resolve()
    },
    signInDone: () => undefined,
    signOut: () => {
      log.push(`${id} logout`)

      return Promise.resolve(true)
    },
    usage: () => {
      log.push(`${id} usage`)

      return Promise.resolve(null)
    },
    account: () => Promise.resolve(who),
    dispose: () => Promise.resolve(),
  }) as unknown as CodexCatalog

const deskWith = (who: CodexAccount, instant = true) => {
  const accounts = fakeAccounts()
  const log: Log = []
  let changes = 0
  const desk = new CodexAccountDesk(accounts, {
    catalog: fakeCatalog('current', who, () => undefined, log, instant),
    catalogFor: (id, onNotice) => fakeCatalog(id, who, onNotice, log, instant),
    openUrl: () => true,
    changed: () => undefined,
    accountChanged: () => {
      changes += 1

      return Promise.resolve()
    },
    cliFound: () => true,
  })

  return { desk, accounts, log, changes: () => changes }
}

describe('стол аккаунтов Codex', () => {
  it('новый аккаунт: вошёл - в список и в работу', async () => {
    const { desk, accounts, changes } = deskWith({ kind: 'chatgpt', email: 'b@x', plan: 'pro' })

    await desk.add()
    await expect.poll(() => accounts.list.length).toBe(2)
    expect(accounts.current).toBe(accounts.list[1]?.id)
    expect(changes()).toBe(1)
    expect(desk.state()).toMatchObject({ signingIn: null, lastOutcome: 'landed' })
  })

  it('вошли тем же человеком, что уже есть, - дубль не встаёт', async () => {
    const { desk, accounts, changes } = deskWith({ kind: 'chatgpt', email: 'a@x', plan: 'plus' })

    await desk.add()
    await expect.poll(() => desk.state().lastOutcome).toBe('twin')
    expect(accounts.list).toHaveLength(1)
    expect(changes()).toBe(0)
  })

  it('выход из строки - каталогом этого аккаунта, его почта забыта; аккаунт в работе не тронут', async () => {
    const { desk, accounts, log, changes } = deskWith({
      kind: 'chatgpt',
      email: 'b@x',
      plan: 'pro',
    })

    await desk.add()
    await expect.poll(() => accounts.list.length).toBe(2)

    const added = accounts.list[1]!.id

    await desk.select('')
    await desk.signOut(added)
    expect(log).toEqual([`${added} logout`])
    expect(accounts.find(added)).toMatchObject({ email: '' })
    expect(accounts.current).toBe('')

    await desk.signOut('')
    expect(log).toEqual([`${added} logout`, 'current logout'])
    expect(changes()).toBe(3)
  })

  it('чужой id - ничего; «забыть» посреди входа в тот же аккаунт - вход сначала снят', async () => {
    const { desk, accounts, log, changes } = deskWith(
      { kind: 'chatgpt', email: 'b@x', plan: 'pro' },
      false,
    )

    await desk.signIn('ffffffffffffffff')
    await desk.select('ffffffffffffffff')
    await desk.forget('ffffffffffffffff')
    expect(changes()).toBe(0)
    expect(desk.state().signingIn).toBeNull()

    accounts.remember('00000000000000aa', { email: 'c@x', plan: 'plus' })
    await desk.signIn('00000000000000aa')
    expect(desk.state().signingIn).toBe('00000000000000aa')

    await desk.forget('00000000000000aa')
    expect(log).toEqual(['00000000000000aa cancel'])
    expect(desk.state().signingIn).toBeNull()
    expect(accounts.find('00000000000000aa')).toBeUndefined()
  })

  it('лимиты не текущих - не чаще шага на аккаунт, идущий вопрос не повторяется', async () => {
    const { desk, accounts, log } = deskWith({ kind: 'chatgpt', email: 'b@x', plan: 'pro' })

    accounts.remember('00000000000000aa', { email: 'c@x', plan: 'plus' })
    await Promise.all([
      desk.refreshOthers(['', '00000000000000aa']),
      desk.refreshOthers(['00000000000000aa']),
    ])
    await desk.refreshOthers(['00000000000000aa'])
    expect(log).toEqual(['00000000000000aa usage'])
  })
})
