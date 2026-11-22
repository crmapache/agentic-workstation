// @vitest-environment happy-dom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { it, expect, describe, afterEach, beforeEach } from 'vitest'

import { useRowScroll } from './FlowSection.hooks'
import type { RowStart } from './FlowSection.types'

/** Наблюдатель размеров, которого дёргает сама проверка: в happy-dom раскладки нет. */
let notify: () => void = () => undefined

class ManualObserver {
  constructor(callback: () => void) {
    notify = callback
  }

  observe() {}

  disconnect() {}
}

const Row = ({ start }: { start: RowStart }) => {
  const { row, track } = useRowScroll(start)

  return createElement(
    'div',
    { ref: row, 'data-testid': 'row' },
    createElement(
      'div',
      { ref: track },
      createElement('section', { 'data-group-column': 'g1' }),
      createElement('section', { 'data-group-column': 'g2' }),
    ),
  )
}

const box = (left: number) => ({ left }) as DOMRect

let host: HTMLDivElement
let width = 0

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  globalThis.ResizeObserver = ManualObserver as unknown as typeof ResizeObserver
  host = document.createElement('div')
  document.body.append(host)
  width = 0
})

afterEach(() => host.remove())

const mount = (start: RowStart) => {
  const root = createRoot(host)

  act(() => root.render(createElement(Row, { start })))

  const row = host.querySelector<HTMLElement>('[data-testid="row"]')

  if (!row) throw new Error('нет ряда')

  Object.defineProperty(row, 'clientWidth', { get: () => width })
  Object.defineProperty(row, 'scrollWidth', { get: () => 2000 })
  row.getBoundingClientRect = () => box(100)
  const column = host.querySelector<HTMLElement>('[data-group-column="g2"]')

  if (column) column.getBoundingClientRect = () => box(100 + 300 - row.scrollLeft)

  return { row, root }
}

describe('ряд встаёт к работе, когда появляется на экране', () => {
  it('спрятанный не двигается; появился - к колонке; на экране его двигает только человек', () => {
    const { row, root } = mount({ kind: 'group', id: 'g2' })

    act(() => notify())
    expect(row.scrollLeft).toBe(0)

    width = 400
    act(() => notify())
    expect(row.scrollLeft).toBe(300)

    row.scrollLeft = 50
    act(() => notify())
    expect(row.scrollLeft).toBe(50)

    // Вид спрятали и открыли снова - ряд опять у работы.
    width = 0
    act(() => notify())
    width = 400
    act(() => notify())
    expect(row.scrollLeft).toBe(300)

    act(() => root.unmount())
  })
})
