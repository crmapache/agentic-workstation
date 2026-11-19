import { it, expect, describe } from 'vitest'

import { enterAction } from './send-key.utils'

describe('клавиша отправки', () => {
  const key = (shiftKey = false, metaKey = false) => ({ shiftKey, metaKey, ctrlKey: false })

  it('отправляют и Enter, и Cmd+Enter; Shift+Enter - перенос', () => {
    expect(enterAction(key())).toBe('send')
    expect(enterAction(key(false, true))).toBe('send')
    expect(enterAction(key(true))).toBe('newline')
    expect(enterAction(key(true, true))).toBe('send')
  })
})
