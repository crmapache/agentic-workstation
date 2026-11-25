import { it, expect, describe } from 'vitest'

import { bannerOf } from './inbox-banner'
import { blankItem } from './inbox-items'

describe('banner of a notification', () => {
  it('says who in the subtitle and keeps the lines of the gist without markup', () => {
    const banner = bannerOf(
      blankItem({
        kind: 'reminder',
        title: 'Demo',
        source: 'Calendar',
        body: 'In 10 min · **10:00 - 10:30** · Support  \n\n## Microsoft Teams Meeting',
      }),
    )

    expect(banner).toEqual({
      title: 'Demo',
      subtitle: 'Calendar',
      body: 'In 10 min · 10:00 - 10:30 · Support\nMicrosoft Teams Meeting',
    })
  })
})
