import { it, expect, describe } from 'vitest'

import { accountFromRead } from '../catalog/catalog-shapes'
import type { CodexCatalog } from '../catalog/codex-catalog'
import { CodexSignIn } from './codex-sign-in'

const fakeCatalog = (started: { loginId: string; authUrl: string } | null) => {
  const calls: string[] = []
  const catalog = {
    startSignIn: () => {
      calls.push('start')

      return Promise.resolve(started)
    },
    cancelSignIn: (loginId: string) => {
      calls.push(`cancel ${loginId}`)

      return Promise.resolve()
    },
    signInDone: () => calls.push('done'),
  } as unknown as CodexCatalog

  return { catalog, calls }
}

describe('вход в Codex через ChatGPT', () => {
  it('ссылка - в браузер, повторное «Sign in» открывает её же, конец входа - вошли', async () => {
    const { catalog, calls } = fakeCatalog({ loginId: 'l1', authUrl: 'https://auth' })
    const opened: string[] = []
    let landed = 0
    const flow = new CodexSignIn({
      catalog,
      openUrl: (url) => {
        opened.push(url)

        return true
      },
      changed: () => undefined,
      signedIn: () => {
        landed += 1

        return Promise.resolve()
      },
    })

    await flow.start()
    await flow.start()
    expect(calls).toEqual(['start'])
    expect(opened).toEqual(['https://auth', 'https://auth'])
    expect(flow.isWaiting).toBe(true)

    flow.completed({ loginId: 'other', success: true })
    expect(flow.isWaiting).toBe(true)

    flow.completed({ loginId: 'l1', success: true, error: null })
    expect(flow.isWaiting).toBe(false)
    expect(flow.outcome).toBe('landed')
    expect(landed).toBe(1)
    expect(calls).toEqual(['start', 'done'])
  })

  it('вход не начался или отменён - строкой на экране входа', async () => {
    const failed = new CodexSignIn({
      catalog: fakeCatalog(null).catalog,
      openUrl: () => true,
      changed: () => undefined,
      signedIn: () => Promise.resolve(),
    })

    await failed.start()
    expect(failed.outcome).toBe('open-failed')

    const { catalog, calls } = fakeCatalog({ loginId: 'l2', authUrl: 'https://auth' })
    const cancelled = new CodexSignIn({
      catalog,
      openUrl: () => true,
      changed: () => undefined,
      signedIn: () => Promise.resolve(),
    })

    await cancelled.start()
    await cancelled.cancel()
    expect(cancelled.outcome).toBe('cancelled')
    expect(calls).toEqual(['start', 'cancel l2'])
  })

  it('кто вошёл: сбой ответа - неизвестно, без входа OpenAI - вошёл', () => {
    expect(accountFromRead(null)).toBeUndefined()
    expect(accountFromRead({ account: null, requiresOpenaiAuth: true })).toBeNull()
    expect(accountFromRead({ account: null, requiresOpenaiAuth: false })).toMatchObject({
      kind: 'other',
    })
    expect(
      accountFromRead({ account: { type: 'chatgpt', email: 'a@b', planType: 'plus' } }),
    ).toEqual({ kind: 'chatgpt', email: 'a@b', plan: 'plus' })
  })
})
