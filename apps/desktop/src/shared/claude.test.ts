import { it, expect, describe } from 'vitest'

import { isModeOff, modeAvailability } from './claude'

describe('доступность режимов', () => {
  const none = { bypass: false, autoModels: [] }
  const opus = { model: 'opus', activeModel: null }

  it('bypass - только когда слои его не запрещают и CLI не отказал', () => {
    expect(modeAvailability(none, false, opus).bypass).toBe(true)
    expect(modeAvailability(none, undefined, opus).bypass).toBe(false)
    expect(modeAvailability({ ...none, bypass: true }, false, opus).bypass).toBe(false)
  })

  it('auto - по модели: отказ на другой модели его не гасит', () => {
    const refused = { bypass: false, autoModels: ['haiku'] }

    expect(modeAvailability(refused, false, opus).auto).toBe(true)
    expect(modeAvailability(refused, false, { model: null, activeModel: 'haiku' }).auto).toBe(false)
    // Новая вкладка (разговора ещё нет) - как меню New chats: auto не гасится.
    expect(modeAvailability(refused, false, null).auto).toBe(true)
  })

  it('погашенный в меню - только недоступный необязательный режим', () => {
    const available = { bypass: false, auto: true }

    expect(isModeOff('bypassPermissions', available)).toBe(true)
    expect(isModeOff('auto', available)).toBe(false)
    expect(isModeOff('plan', { bypass: false, auto: false })).toBe(false)
  })
})
