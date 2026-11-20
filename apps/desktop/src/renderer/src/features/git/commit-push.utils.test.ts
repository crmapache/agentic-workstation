import type { TFunction } from 'i18next'
import { it, expect, describe } from 'vitest'

import { commitPushNotice } from './commit-push.utils'

const t = ((key: string, values: Record<string, unknown> = {}) =>
  `${key}${JSON.stringify(values)}`) as unknown as TFunction

const label = (id: string) => `<${id}>`

describe('итог Commit and push в углу окна', () => {
  it('ушло - сообщение и кто его написал', () => {
    expect(
      commitPushNotice(
        { outcome: 'pushed', message: 'feat: x\n\nWhy.', by: 'codex', summary: '' },
        t,
        label,
      ),
    ).toEqual({
      tone: 'success',
      title: 'git.commitPush.pushed{}',
      details: 'feat: x\n\nWhy.\n\ngit.commitPush.by{"provider":"<codex>"}',
    })
  })

  it('коммит лёг, push отказал - слова git и тема коммита', () => {
    expect(
      commitPushNotice(
        { outcome: 'committed', message: 'feat: x\n\nWhy.', by: 'claude', details: 'rejected' },
        t,
        label,
      ),
    ).toMatchObject({
      tone: 'danger',
      details: 'rejected\n\ngit.commitPush.committedAs{"message":"feat: x"}',
    })
  })

  it('не вышло - шаг в заголовке', () => {
    expect(
      commitPushNotice({ outcome: 'failed', stage: 'message', details: 'codex: limit' }, t, label),
    ).toEqual({
      tone: 'danger',
      title: 'git.commitPush.failed.message{}',
      details: 'codex: limit',
    })
  })
})
