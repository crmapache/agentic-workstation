import { it, expect, describe, afterEach } from 'vitest'

import type {
  AccountsWire,
  ConnectorsWire,
} from '@agentic-workstation/remote-protocol/machine-wire-types'

import { bridgeSetup, stopBridges } from '../__fixtures__/fake-bridge'
import { ACCOUNT_ID, CONNECTORS } from '../__fixtures__/fake-extras'
import { RECENT_PATH, PROJECT_PATH } from '../__fixtures__/fake-ide'
import { maskEmail } from './machine-wire'
import { projectKey } from './project-keys'

afterEach(stopBridges)

const callsOf = (ide: ReturnType<typeof bridgeSetup>['ide'], name: string) =>
  ide.calls.filter((call) => call.name === name).map((call) => call.args)

describe('аккаунты с телефона', () => {
  it('список: почта замаскирована, лимиты числами, отказ лимита, свежие цифры у вошедших', async () => {
    const { ide, command } = bridgeSetup()
    const listed = await command('accounts.list', {})
    const { accounts } = (listed as { data: AccountsWire }).data

    expect(JSON.stringify(accounts)).not.toContain('mzpizote@')
    expect(accounts.map((account) => [account.id, account.email, account.current])).toEqual([
      ['', 'mz…e@gmail.com', true],
      [ACCOUNT_ID, 'm…@company.example', false],
      ['fedcba9876543210', 'o…@x.io', false],
    ])
    expect(accounts[0]?.usage?.windows).toEqual([
      { group: 'session', model: '', percent: 64, resetsAt: 5_000 },
      { group: 'weekly', model: '', percent: 20, resetsAt: 90_000 },
    ])
    expect(accounts[1]).toMatchObject({ refusedUntil: 7_000, usage: null })
    expect(callsOf(ide, 'accounts.refreshUsage')).toEqual([[['', ACCOUNT_ID]]])
  })

  it('выбрать вошедший - новый список; без входа и чужой - отказ, ничего не меняется', async () => {
    const { ide, command } = bridgeSetup()

    expect(await command('accounts.use', { accountId: 'fedcba9876543210' })).toMatchObject({
      ok: false,
      code: 'refused',
      detail: 'notSignedIn',
    })
    expect(await command('accounts.use', { accountId: 'aaaaaaaaaaaaaaaa' })).toMatchObject({
      ok: false,
      code: 'notFound',
    })
    expect(callsOf(ide, 'accounts.use')).toEqual([])

    const used = await command('accounts.use', { accountId: ACCOUNT_ID })

    expect(callsOf(ide, 'accounts.use')).toEqual([[ACCOUNT_ID]])
    expect(
      (used as { data: AccountsWire }).data.accounts.find((account) => account.current)?.id,
    ).toBe(ACCOUNT_ID)
  })

  it('имя, забыть и выйти - те же действия, что у окна', async () => {
    const { ide, command } = bridgeSetup()

    await command('accounts.rename', { accountId: ACCOUNT_ID, alias: 'Office' })
    await command('accounts.forget', { accountId: ACCOUNT_ID })
    await command('accounts.logout', {})

    expect(callsOf(ide, 'accounts.rename')).toEqual([[ACCOUNT_ID, 'Office']])
    expect(callsOf(ide, 'accounts.forget')).toEqual([[ACCOUNT_ID]])
    expect(callsOf(ide, 'accounts.logout')).toEqual([[]])
  })
})

describe('коннекторы с телефона', () => {
  it('без команд, адресов и ключей; чей вход - замаскирован; инструменты числом', async () => {
    const { command } = bridgeSetup()
    const listed = await command('connectors.list', {})
    const wire = (listed as { data: ConnectorsWire }).data

    expect(JSON.stringify(wire)).not.toMatch(/sk-secret|\/Users\/|max@company/)
    expect(wire.connectors[0]).toMatchObject({
      kind: 'gmail',
      account: 'm…@company.example',
      status: 'connected',
      tools: 2,
      toolsOn: 1,
    })
    expect(wire.connectors[1]).toMatchObject({ name: 'Chatkepr', failure: 'unreachable' })
  })

  it('переподключить - только знакомый коннектор', async () => {
    const { ide, command } = bridgeSetup()
    const id = CONNECTORS[0]?.id ?? ''

    expect(
      await command('connectors.reconnect', {
        connectorId: '00000000-0000-0000-0000-000000000000',
      }),
    ).toMatchObject({ ok: false, code: 'notFound' })
    expect(await command('connectors.reconnect', { connectorId: id })).toMatchObject({ ok: true })
    expect(callsOf(ide, 'connectors.reconnect')).toEqual([[id]])
  })
})

describe('недавний проект с телефона', () => {
  it('открывается вкладкой в окне; открытый - без дела; незнакомый ключ - отказ', async () => {
    const { ide, command } = bridgeSetup()

    expect(await command('projects.open', { projectKey: projectKey(PROJECT_PATH) })).toMatchObject({
      ok: true,
    })
    expect(await command('projects.open', { projectKey: `p-${'z'.repeat(22)}` })).toMatchObject({
      ok: false,
      code: 'notFound',
    })
    expect(callsOf(ide, 'workspace.openRecent')).toEqual([])

    expect(await command('projects.open', { projectKey: projectKey(RECENT_PATH) })).toMatchObject({
      ok: true,
    })
    expect(callsOf(ide, 'workspace.openRecent')).toEqual([[RECENT_PATH]])
  })
})

describe('маска почты', () => {
  it('начало и конец имени и домен; короткое имя - первая буква; не почта - как есть', () => {
    expect(maskEmail('mzpizote@gmail.com')).toBe('mz…e@gmail.com')
    expect(maskEmail('abc@x.io')).toBe('a…@x.io')
    expect(maskEmail('Acme workspace')).toBe('Acme workspace')
    expect(maskEmail('')).toBe('')
  })
})
