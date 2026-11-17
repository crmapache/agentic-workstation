import { it, expect, describe } from 'vitest'

import { frameSize, cameraProblemOf } from './QrCamera.utils'

describe('кадр для разбора QR', () => {
  it('длинная сторона ужимается до предела, пропорции те же', () => {
    expect(frameSize(1280, 720, 960)).toEqual({ width: 960, height: 540 })
    expect(frameSize(720, 1280, 960)).toEqual({ width: 540, height: 960 })
  })

  it('мелкий кадр не растягивается', () => {
    expect(frameSize(640, 480, 960)).toEqual({ width: 640, height: 480 })
  })
})

describe('что с камерой - по ошибке getUserMedia', () => {
  const named = (name: string) => ({ name, message: '' })

  it('отказ человека или политики страницы - не разрешена', () => {
    expect(cameraProblemOf(named('NotAllowedError'))).toBe('denied')
    expect(cameraProblemOf(named('SecurityError'))).toBe('denied')
  })

  it('камеры нет или нет подходящей - не найдена', () => {
    expect(cameraProblemOf(named('NotFoundError'))).toBe('missing')
    expect(cameraProblemOf(named('OverconstrainedError'))).toBe('missing')
  })

  it('камеру держит другое приложение - занята', () => {
    expect(cameraProblemOf(named('NotReadableError'))).toBe('busy')
  })

  it('всё прочее, в том числе не ошибка вовсе, - не запустилась', () => {
    expect(cameraProblemOf(new TypeError('Failed to fetch dynamically imported module'))).toBe(
      'failed',
    )
    expect(cameraProblemOf('boom')).toBe('failed')
    expect(cameraProblemOf(null)).toBe('failed')
  })
})
