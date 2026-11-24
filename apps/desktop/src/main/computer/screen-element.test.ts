import { it, expect, describe } from 'vitest'

import type { InputDriver, ScreenElement } from './computer.types'
import {
  roleWords,
  clickedText,
  screenLabel,
  clickRefusal,
  elementUnder,
  pressedSoFar,
  describeMacChain,
  describeUiaChain,
} from './screen-element'
import type { MacAxNode } from './screen-element'

const ax = (role: string, overrides: Partial<MacAxNode> = {}): MacAxNode => ({
  role,
  subrole: '',
  title: '',
  description: '',
  value: '',
  labelledBy: '',
  placeholder: '',
  ...overrides,
})

const button = (name: string): ScreenElement => ({
  role: 'button',
  name,
  app: 'Calculator',
  isActionable: true,
})

describe('ответ доступности macOS', () => {
  it('кнопка Калькулятора: имя - из описания, приложение - из AXApplication', () => {
    expect(
      describeMacChain(
        [
          ax('AXButton', { description: '7' }),
          ax('AXGroup'),
          ax('AXGroup', { subrole: 'AXHostingView' }),
        ],
        'Calculator',
      ),
    ).toEqual(button('7'))
  })

  it('текст внутри пункта меню называется пунктом меню; подроль - в скобках', () => {
    expect(
      describeMacChain(
        [ax('AXStaticText', { value: 'Delete' }), ax('AXMenuItem', { title: 'Move to Trash' })],
        'Finder',
      ),
    ).toEqual({ role: 'menu item', name: 'Move to Trash', app: 'Finder', isActionable: true })
    expect(describeMacChain([ax('AXButton', { subrole: 'AXCloseButton' })], 'Finder')?.role).toBe(
      'button (close button)',
    )
  })

  it('поле называется подписью рядом или подсказкой, а не своим текстом', () => {
    const field = (overrides: Partial<MacAxNode>) =>
      describeMacChain([ax('AXTextField', overrides)], 'Mail')?.name

    expect(field({ labelledBy: 'Subject', value: 'Quarterly report' })).toBe('Subject')
    expect(field({ placeholder: 'Search' })).toBe('Search')
    expect(field({ value: 'Quarterly report' })).toBe('')
    expect(describeMacChain([ax('AXPopUpButton', { value: 'Medium' })], 'Pages')?.name).toBe(
      'Medium',
    )
    expect(describeMacChain([ax('AXStaticText', { value: 'Delete' })], 'Finder')?.name).toBe(
      'Delete',
    )
  })

  it('веб-содержимое Chrome без доступности - область прокрутки, не действующая', () => {
    expect(describeMacChain([ax('AXScrollArea'), ax('AXGroup'), ax('AXWindow')], 'Slack')).toEqual({
      role: 'scroll area',
      name: '',
      app: 'Slack',
      isActionable: false,
    })
  })

  it('пустая цепочка - элемента нет', () => {
    expect(describeMacChain([], 'Finder')).toBeNull()
    expect(roleWords('AXMenuBarItem')).toBe('menu bar item')
    expect(roleWords('AXPopUpButton')).toBe('pop up button')
  })
})

describe('ответ UI Automation', () => {
  it('текст внутри кнопки - кнопка; панель - не действующая; неизвестный тип - номером', () => {
    expect(
      describeUiaChain(
        [
          { controlType: 50020, name: 'Send' },
          { controlType: 50000, name: 'Send' },
        ],
        'Outlook',
      ),
    ).toEqual({ role: 'button', name: 'Send', app: 'Outlook', isActionable: true })
    expect(describeUiaChain([{ controlType: 50033, name: '' }], 'App')).toMatchObject({
      role: 'pane',
      isActionable: false,
    })
    expect(describeUiaChain([{ controlType: 50099, name: 'x' }], 'App')?.role).toBe('control 50099')
    expect(describeUiaChain([], 'App')).toBeNull()
  })
})

describe('можно ли жать', () => {
  const unknown = { element: null, reason: 'the app there did not answer in time' }

  it('expect «7» в точке «8» - отказ; в точке «7» - можно', () => {
    expect(clickRefusal({ element: button('8') }, '7')).toBe(
      'Under the pointer is button "8" in Calculator, not "7".',
    )
    expect(clickRefusal({ element: button('7') }, ' 7 ')).toBeNull()
  })

  it('действующий элемент без expect - отказ; текст и холст без expect - можно', () => {
    expect(clickRefusal({ element: button('Delete') }, undefined)).toBe(
      'Under the pointer is button "Delete" in Calculator. Buttons, menu items, links and fields need expect: the label of what you mean to click.',
    )
    expect(
      clickRefusal({ element: { ...button(''), role: 'group', isActionable: false } }, undefined),
    ).toBeNull()
  })

  it('кнопка без имени: без expect - можно с пометкой, с expect - отказ, сверить не с чем', () => {
    const icon = { element: button('') }

    expect(clickRefusal(icon, undefined)).toBeNull()
    expect(clickRefusal(icon, 'Delete')).toBe(
      `Under the pointer is button in Calculator, which has no name, so "Delete" can't be checked. Click it without expect if it is what you mean.`,
    )
    expect(clickedText(icon, { x: 1, y: 2 })).toBe(
      'Clicked button in Calculator; it has no name, so the click could not be checked against a label.',
    )
  })

  it('элемент не определён: без expect - можно, с expect - отказ, проверить нечем', () => {
    expect(clickRefusal(unknown, undefined)).toBeNull()
    expect(clickRefusal(unknown, 'Save')).toBe(
      `The element under the pointer can't be determined (the app there did not answer in time), so "Save" can't be checked.`,
    )
  })

  it('ответ клика - что нажато; не определён - с пометкой и причиной', () => {
    expect(clickedText({ element: button('7') }, { x: 10, y: 20 })).toBe(
      'Clicked button "7" in Calculator.',
    )
    expect(clickedText(unknown, { x: 10, y: 20 })).toBe(
      'Clicked at (10, 20); the element there could not be determined (the app there did not answer in time).',
    )
    expect(screenLabel({ ...button(''), app: '' })).toBe('button')
    expect(pressedSoFar(null, 0)).toBe('Nothing was clicked.')
    expect(pressedSoFar({ element: button('7') }, 1)).toBe(
      'The first click went to button "7" in Calculator; the rest of the clicks were not sent.',
    )
    // Тройной клик, отказ на третьем: двойной уже ушёл - модель должна это знать.
    expect(pressedSoFar({ element: button('7') }, 2)).toBe(
      'The first 2 clicks went to button "7" in Calculator; the rest of the clicks were not sent.',
    )
  })

  it('система не умеет сказать или поиск сорвался - элемент не определён, а не исключение', () => {
    const input = {} as InputDriver

    expect(elementUnder(input, { x: 1, y: 1 })).toMatchObject({ element: null })
    expect(
      elementUnder(
        {
          ...input,
          elementAt: () => {
            throw new Error('koffi')
          },
        },
        { x: 1, y: 1 },
      ),
    ).toEqual({ element: null, reason: 'the accessibility lookup failed' })
  })
})
