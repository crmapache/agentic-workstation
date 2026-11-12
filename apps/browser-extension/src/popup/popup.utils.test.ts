import { it, expect, describe } from 'vitest'

import type { LinkView } from '../common/messages'
import { linkRows } from './popup.utils'

const link = (channel: LinkView['channel'], state: LinkView['state']): LinkView => ({
  channel,
  state,
  ideVersion: null,
  sessions: [],
})

describe('связи в окне значка', () => {
  it('не установленный dev не показывается рядом с живой IDE', () => {
    expect(linkRows([link('installed', 'connected'), link('dev', 'host-missing')])).toEqual({
      rows: [link('installed', 'connected')],
      missing: false,
    })
  })

  it('не установлен ни один host - строка IDE и подсказка', () => {
    expect(linkRows([link('installed', 'host-missing'), link('dev', 'host-missing')])).toEqual({
      rows: [link('installed', 'host-missing')],
      missing: true,
    })
  })

  it('обе IDE видны, когда обе есть', () => {
    expect(
      linkRows([link('installed', 'ide-offline'), link('dev', 'connected')]).rows,
    ).toHaveLength(2)
  })
})
