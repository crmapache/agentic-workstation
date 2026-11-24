import { it, expect, describe } from 'vitest'

import type { AxNode } from './ax-snapshot'
import { judge, isInsideRef, describeAxChain, labelledControl } from './click-check'
import type { Hit, HitAxNode } from './click-check'
import { elementLabel, matchesExpect } from './expect-label'
import { MAIN_FRAME } from './frame-refs'
import type { SnapshotFrame } from './frame-refs'

const ax = (role: string, name: string, backend?: number, ignored = false): AxNode => ({
  nodeId: `n${backend ?? role}`,
  role: { value: role },
  name: { value: name },
  ...(backend !== undefined ? { backendDOMNodeId: backend } : {}),
  ...(ignored ? { ignored } : {}),
})

/** Попадание в «Rechazar» (узел 7) внутри строки 6 главного документа. */
const hit = (overrides: Partial<Hit> = {}): Hit => ({
  node: 7,
  target: undefined,
  owners: [],
  role: 'button',
  name: 'Rechazar',
  isActionable: true,
  path: [7, 6, 1],
  ancestry: [
    { node: 7, role: 'button', name: 'Rechazar' },
    { node: 6, role: 'generic', name: '' },
  ],
  ...overrides,
})

const CROSS: SnapshotFrame = { id: 'f1', target: 'CROSS', parent: MAIN_FRAME, owner: 20 }

describe('сверка подписи', () => {
  it('целиком, без учёта регистра, пробелов, кавычек и хвостовой пунктуации', () => {
    expect(matchesExpect('Aceptar', 'aceptar')).toBe(true)
    expect(matchesExpect('  Aceptar   invitación ', 'ACEPTAR INVITACIÓN')).toBe(true)
    expect(matchesExpect('Save As…', 'Save As')).toBe(true)
    expect(matchesExpect('Don’t Save', "don't save")).toBe(true)
    expect(matchesExpect('Rechazar', 'Aceptar')).toBe(false)
    expect(matchesExpect('Aceptar', '   ')).toBe(false)
    expect(matchesExpect('', 'Aceptar')).toBe(false)
  })

  // Вхождение пустило бы соседнюю кнопку - ровно случай, ради которого проверка.
  it('соседняя кнопка, чьё имя содержит ожидание, не совпадает', () => {
    expect(matchesExpect("Don't Save", 'Save')).toBe(false)
    expect(matchesExpect('Reply all', 'Reply')).toBe(false)
    expect(matchesExpect('Delete forever', 'Delete')).toBe(false)
    expect(matchesExpect('Unsubscribe', 'Subscribe')).toBe(false)
    expect(matchesExpect('21', '1')).toBe(false)
    expect(matchesExpect('Aceptar invitación', 'Aceptar')).toBe(false)
  })

  it('длинное имя, скопированное из ответа обрезанным, узнаётся; короткое начало - нет', () => {
    const name = `From Ana: ${'quarterly report draft and the numbers for review, '.repeat(4)}`
    const shown = elementLabel('option', name)
    const copied = /"(.*)"/.exec(shown)?.[1] ?? ''

    expect(copied.endsWith('…')).toBe(true)
    expect(matchesExpect(name, copied)).toBe(true)
    expect(matchesExpect('Reply all', 'Reply…')).toBe(false)
  })
})

describe('что под точкой словами', () => {
  it('текст внутри кнопки называется кнопкой; имя - целиком', () => {
    const long = 'x'.repeat(300)
    const chain = [ax('generic', '', 8, true), ax('button', long, 7), ax('main', '', 2)]

    expect(describeAxChain(8, chain)).toEqual({
      role: 'button',
      name: long,
      isActionable: true,
      path: [8, 8, 7, 2],
      ancestry: [
        { node: 7, role: 'button', name: long },
        { node: 2, role: 'main', name: '' },
      ],
    })
  })

  it('холст, текст, пустое место и подпись без поля - не действующие', () => {
    expect(describeAxChain(3, [ax('Canvas', '', 3), ax('RootWebArea', 'Page', 1)])).toMatchObject({
      role: 'Canvas',
      isActionable: false,
    })
    expect(
      describeAxChain(4, [ax('generic', '', 4), ax('paragraph', '', 5), ax('RootWebArea', 'P', 1)]),
    ).toMatchObject({ role: 'paragraph', name: '', isActionable: false })
    expect(describeAxChain(6, [ax('LabelText', 'Lonely', 6)]).isActionable).toBe(false)
  })

  it('флажок, пункт меню, вкладка, ссылка, вариант и поле - действующие', () => {
    for (const role of ['checkbox', 'menuitem', 'tab', 'link', 'option', 'textbox']) {
      expect(describeAxChain(1, [ax(role, 'X', 1)]).isActionable).toBe(true)
    }
  })

  // Chrome прячет подпись поля (labelFor) и называет в причине само поле.
  it('подпись поля под точкой - попадание в само поле', () => {
    const label: HitAxNode = {
      ...ax('none', '', 12, true),
      ignoredReasons: [{ name: 'labelFor', value: { relatedNodes: [{ backendDOMNodeId: 11 }] } }],
    }
    const chain = [ax('generic', '', 25), label, ax('generic', '', 10)]
    const control = ax('checkbox', 'Remember me', 11)

    expect(labelledControl(chain)).toBe(11)
    expect(labelledControl([ax('generic', '', 1)])).toBeNull()
    expect(describeAxChain(25, chain, control)).toMatchObject({
      role: 'checkbox',
      name: 'Remember me',
      isActionable: true,
      path: [25, 11, 25, 12, 10],
    })
  })

  it('дерево доступности не ответило - узел без имени', () => {
    expect(describeAxChain(9, [])).toEqual({
      role: '',
      name: '',
      isActionable: false,
      path: [9],
      ancestry: [],
    })
  })
})

describe('внутри ли ref', () => {
  it('сам элемент или потомок в его сессии - да; тот же номер в другой сессии - нет', () => {
    expect(isInsideRef(hit(), { node: 6, frame: MAIN_FRAME })).toBe(true)
    expect(isInsideRef(hit(), { node: 5, frame: MAIN_FRAME })).toBe(false)
    expect(isInsideRef(hit({ target: 'CROSS' }), { node: 6, frame: MAIN_FRAME })).toBe(false)
    expect(isInsideRef(hit({ target: 'CROSS' }), { node: 6, frame: CROSS })).toBe(true)
  })

  it('ссылка на iframe или его обёртку - попадание внутри документа фрейма', () => {
    const inside = hit({ target: 'CROSS', owners: [{ target: undefined, path: [20, 19, 1] }] })

    expect(isInsideRef(inside, { node: 20, frame: MAIN_FRAME })).toBe(true)
    expect(isInsideRef(inside, { node: 19, frame: MAIN_FRAME })).toBe(true)
    expect(isInsideRef(inside, { node: 18, frame: MAIN_FRAME })).toBe(false)
  })
})

describe('можно ли жать', () => {
  const button = { node: 7, frame: MAIN_FRAME }
  const row = { node: 6, frame: MAIN_FRAME }

  it('ref на месте - да; сдвинулся - отказ с тем, что под мышью, и можно прицелиться заново', () => {
    expect(judge({ ref: 'e3' }, hit(), button)).toEqual({ ok: true })
    expect(judge({ ref: 'e3' }, hit(), { node: 5, frame: MAIN_FRAME })).toEqual({
      ok: false,
      reaim: true,
      reason: 'Element e3 moved or is covered: under the pointer is button "Rechazar" now.',
      next: 'Take a new snapshot and try again with its ref.',
    })
    expect(judge({ ref: 'e3' }, null, button)).toMatchObject({ ok: false, reaim: true })
  })

  it('под мышью другая кнопка внутри ref (строка письма и её «Delete») - не жать в неё', () => {
    expect(judge({ ref: 'e2' }, hit(), row)).toEqual({
      ok: false,
      reaim: true,
      reason: 'Under the pointer is button "Rechazar" inside e2, not e2 itself.',
      next: 'Click it by its own ref if you mean it, or take a new snapshot and try again.',
    })
  })

  it('ссылка внутри поля ввода - не помеха: нажатие в редактор ставит курсор', () => {
    const inEditor = hit({
      ancestry: [
        { node: 7, role: 'link', name: 'docs' },
        { node: 6, role: 'textbox', name: 'Message' },
      ],
    })

    expect(judge({ ref: 'e2' }, inEditor, row)).toEqual({ ok: true })
  })

  it('x,y в кнопку без expect - отказ с подсказкой про ref и expect', () => {
    expect(judge({ point: { x: 10, y: 20 } }, hit(), null)).toEqual({
      ok: false,
      reaim: false,
      reason: 'Under (10, 20) is button "Rechazar".',
      next: 'Click it by ref from a fresh snapshot, or pass expect with the label you mean to click.',
    })
  })

  it('x,y в холст или пустое место без expect - да', () => {
    const canvas = hit({ role: 'Canvas', name: '', isActionable: false })

    expect(judge({ point: { x: 1, y: 1 } }, canvas, null)).toEqual({ ok: true })
    expect(judge({ point: { x: 1, y: 1 } }, null, null)).toEqual({ ok: true })
  })

  it('x,y с expect: совпало - да, нет - отказ; под точкой ничего - проверить нечем', () => {
    const point = { x: 1, y: 1 }

    expect(judge({ point, expect: 'rechazar' }, hit(), null)).toEqual({ ok: true })
    expect(judge({ point, expect: 'Aceptar' }, hit(), null)).toEqual({
      ok: false,
      reaim: false,
      reason: 'Under the pointer is button "Rechazar", not "Aceptar".',
      next: 'Take a new snapshot and click by ref.',
    })
    expect(judge({ point, expect: 'Aceptar' }, null, null)).toMatchObject({
      ok: false,
      reason: `Nothing the page can name is under the pointer, so "Aceptar" can't be checked.`,
    })
  })

  it('ref с expect - и элемент на месте, и имя совпадает', () => {
    expect(judge({ ref: 'e3', expect: 'Aceptar' }, hit(), button)).toMatchObject({ ok: false })
    expect(judge({ ref: 'e3', expect: 'Rechazar' }, hit(), button)).toEqual({ ok: true })
  })
})
