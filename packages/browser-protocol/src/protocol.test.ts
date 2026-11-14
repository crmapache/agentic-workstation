import { it, expect, describe } from 'vitest'

import { parseExtensionMessage } from './protocol'

describe('сообщения расширения', () => {
  it('hello - только со всеми полями', () => {
    const hello = {
      type: 'hello',
      profileKey: 'abcd1234',
      profileName: 'Work',
      browser: 'Google Chrome',
      version: '0.1.0',
      build: 'f00d',
      launch: 'q7w2e9',
    }

    expect(parseExtensionMessage(hello)).toEqual(hello)
    expect(parseExtensionMessage({ ...hello, build: 1 })).toBeNull()
    // Дал ли имя человек - только флагом: чужое значение не принимается за «дал».
    expect(parseExtensionMessage({ ...hello, named: true })).toEqual({ ...hello, named: true })
    expect(parseExtensionMessage({ ...hello, named: 'yes' })).toEqual(hello)
  })

  it('hello расширения прежней сборки, без метки запуска, принимается: ему ещё перезагружаться', () => {
    const { launch: _launch, ...old } = {
      type: 'hello',
      profileKey: 'abcd1234',
      profileName: 'Work',
      browser: 'Google Chrome',
      version: '0.1.0',
      build: 'f00d',
      launch: 'x',
    }

    expect(parseExtensionMessage(old)).toEqual({ ...old, launch: '' })
  })

  it('ответ с ошибкой без кода получает failed', () => {
    expect(parseExtensionMessage({ type: 'response', id: 3, error: { message: 'boom' } })).toEqual({
      type: 'response',
      id: 3,
      error: { code: 'failed', message: 'boom' },
    })
  })

  it('ответ без результата - null', () => {
    expect(parseExtensionMessage({ type: 'response', id: 1 })).toEqual({
      type: 'response',
      id: 1,
      result: null,
    })
  })

  it('чужое - null', () => {
    expect(parseExtensionMessage('hello')).toBeNull()
    expect(parseExtensionMessage({ type: 'request', id: 1 })).toBeNull()
    expect(parseExtensionMessage({ type: 'event', name: 'x' })).toBeNull()
  })
})
