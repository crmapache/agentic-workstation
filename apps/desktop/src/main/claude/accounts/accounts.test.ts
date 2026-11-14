import { it, expect, describe } from 'vitest'

import { accMoves, importableOf, parseAccAccounts } from './acc-import'
import { environmentFor, DRAWER_VARIABLE } from './account-env'
import { parseStoredAccounts } from './account-store'
import { parseAuthStatus } from './auth-status'

describe('аккаунты', () => {
  it('обычный вход - без переменной хранилища, даже унаследованной', () => {
    expect(environmentFor({ PATH: '/bin', [DRAWER_VARIABLE]: '/other' }, null)).toEqual({
      PATH: '/bin',
    })
  })

  it('своё хранилище - переменная и пустые токены, которые иначе бьют его', () => {
    expect(environmentFor({ PATH: '/bin', ANTHROPIC_API_KEY: 'sk' }, '/d/s-1')).toEqual({
      PATH: '/bin',
      ANTHROPIC_API_KEY: '',
      ANTHROPIC_AUTH_TOKEN: '',
      CLAUDE_CODE_OAUTH_TOKEN: '',
      [DRAWER_VARIABLE]: '/d/s-1',
    })
  })

  it('реестр: запись с относительным хранилищем - мимо, выбранный без записи - обычный вход', () => {
    const parsed = parseStoredAccounts({
      current: 'ffffffffffffffff',
      accounts: [
        { id: '0123456789abcdef', drawer: '/d/s-1', alias: 'Work', plan: 'max' },
        { id: 'fedcba9876543210', drawer: 'relative/s-2' },
      ],
    })

    expect(parsed.current).toBe('')
    expect(parsed.accounts.map((account) => account.alias)).toEqual(['Work'])
    // Запись старше поля организации - с пустой: круг экрана допишет её со слов хранилища.
    expect(parsed.accounts[0]?.orgUuid).toBe('')
    expect(parseStoredAccounts({ defaultAlias: 'Home' }).defaultAlias).toBe('Home')
  })

  it('статус входа и аккаунты ACC без черновиков', () => {
    expect(parseAuthStatus('noise {"loggedIn":true,"subscriptionType":"max"}')).toMatchObject({
      loggedIn: true,
      plan: 'max',
    })
    expect(
      parseAccAccounts({
        accounts: [
          { id: 'a1', storeDir: '/acc/s-1', email: 'a@b', plan: 'team' },
          { id: 'pending-s-2', storeDir: '/acc/s-2' },
        ],
      }).map((account) => account.sourceId),
    ).toEqual(['a1'])
  })
})

describe('скрипт входа', () => {
  it('окружение строками, путь с кавычкой не ломает скрипт', async () => {
    const { signInScript } = await import('./sign-in')

    expect(signInScript('/bin/claude', "/d/it's/s-1", '/d/sign-in.pid')).toBe(
      [
        '#!/bin/zsh',
        `export ${DRAWER_VARIABLE}='/d/it'\\''s/s-1'`,
        "export ANTHROPIC_API_KEY=''",
        "export ANTHROPIC_AUTH_TOKEN=''",
        "export CLAUDE_CODE_OAUTH_TOKEN=''",
        "echo $$ > '/d/sign-in.pid'",
        "exec '/bin/claude' auth login",
        '',
      ].join('\n'),
    )
    expect(signInScript('/bin/claude', null, '/d/p')).toContain(`unset ${DRAWER_VARIABLE}`)
  })
})

describe('хранилища', () => {
  it('удалять можно только внутри папки аккаунтов', async () => {
    const { isInside } = await import('./account-drawers')

    expect(isInside('/data/claude-accounts', '/data/claude-accounts/s-1')).toBe(true)
    expect(isInside('/data/claude-accounts', '/data/claude-accounts')).toBe(false)
    expect(isInside('/data/claude-accounts', '/data/claude-accounts/../other')).toBe(false)
    expect(isInside('/data/claude-accounts', '/Users/me/.amazing-claude-code/s-2')).toBe(false)
  })

  it('кто вошёл - только профиль, полученный после вопроса', async () => {
    const { identityFrom } = await import('./identity-probe')
    const config = (fetchedAt: number) => ({
      oauthAccount: {
        emailAddress: 'a@b.c',
        accountUuid: 'u1',
        organizationUuid: 'o1',
        profileFetchedAt: fetchedAt,
      },
    })

    expect(identityFrom(config(200), 100)).toEqual({
      email: 'a@b.c',
      orgUuid: 'o1',
      accountUuid: 'u1',
    })
    expect(identityFrom(config(50), 100)).toBeNull()
    expect(identityFrom({}, 100)).toBeNull()
  })
})

describe('аккаунты ACC', () => {
  const acc = (drawer: string, email: string, orgUuid = 'org-m') => ({
    sourceId: drawer,
    drawer,
    alias: 'Main',
    email,
    orgUuid,
    plan: 'max',
  })
  const record = (
    id: string,
    drawer: string,
    email: string,
    external = true,
    orgUuid = 'org-m',
  ) => ({
    id,
    drawer,
    email,
    orgUuid,
    external,
  })

  it('запись на брошенном ACC хранилище переходит туда, где ACC держит её аккаунт теперь', () => {
    expect(
      accMoves([record('work', '/acc/old', 'm@gmail.com')], [acc('/acc/new', 'M@gmail.com')]),
    ).toEqual([{ id: 'work', drawer: '/acc/new' }])
  })

  it('не трогает живое хранилище ACC, своё хранилище, запись без организации и чужой аккаунт', () => {
    const list = [acc('/acc/live', 'm@gmail.com'), acc('/acc/other', 'r@reclick.io', 'org-r')]

    expect(
      accMoves(
        [
          record('live', '/acc/live', 'm@gmail.com'),
          record('own', '/ide/s-1', 'm@gmail.com', false),
          record('old', '/acc/gone', 'm@gmail.com', true, ''),
          record('stranger', '/acc/gone2', 'x@gmail.com'),
        ],
        list,
      ),
    ).toEqual([])
  })

  it('папку, которую уже держит другая запись, второй раз не отдаёт', () => {
    expect(
      accMoves(
        [record('a', '/acc/old', 'm@gmail.com'), record('b', '/acc/new', 'm@gmail.com', false)],
        [acc('/acc/new', 'm@gmail.com')],
      ),
    ).toEqual([])
  })

  it('не предлагает взять аккаунт, который уже есть записью или обычным входом', () => {
    const list = [
      acc('/acc/a', 'm@gmail.com'),
      acc('/acc/b', 'r@reclick.io', 'org-r'),
      acc('/acc/c', 'new@gmail.com', 'org-n'),
    ]
    const offered = importableOf(
      list,
      [record('w', '/ide/s-1', 'm@gmail.com', false)],
      'r@reclick.io|org-r',
    )

    expect(offered.map((account) => account.drawer)).toEqual(['/acc/c'])
  })
})
