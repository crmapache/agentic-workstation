import { it, expect, describe } from 'vitest'

import type { FileChange } from '@shared/conversation-feed'

import { QUIET_PRESS_MS, PRESS_PATIENCE_MS } from './ChangesList.constants'
import type { Press } from './ChangesList.types'
import {
  rowNote,
  announced,
  addedShown,
  turnTotals,
  withoutStale,
  withoutToken,
  nextPressEvent,
} from './ChangesList.utils'

const change = (fields: Partial<FileChange> = {}): FileChange => ({
  path: '/p/a.ts',
  added: 3,
  removed: 1,
  created: false,
  counted: true,
  undoable: true,
  reverted: false,
  refusal: null,
  ...fields,
})

const press = (fields: Partial<Press> = {}): Press => ({
  restore: false,
  token: 1,
  at: 1000,
  announced: false,
  ...fields,
})

describe('слова на строке файла', () => {
  it('ожидание - только после тихой паузы, потом отказ, пропавший файл, «Reverted»', () => {
    expect(rowNote(change(), press(), false)).toBeNull()
    expect(rowNote(change(), press({ announced: true }), false)?.key).toBe(
      'agentPanel.changes.reverting',
    )
    expect(rowNote(change(), press({ announced: true, restore: true }), false)?.key).toBe(
      'agentPanel.changes.restoring',
    )
    expect(rowNote(change({ reverted: true, refusal: 'changed' }), undefined, false)).toEqual({
      key: 'agentPanel.changes.refusedChanged',
      bad: true,
    })
    expect(rowNote(change(), undefined, true)?.key).toBe('agentPanel.changes.refusedMissing')
    expect(rowNote(change({ reverted: true }), undefined, false)).toEqual({
      key: 'agentPanel.changes.reverted',
      bad: false,
    })
    expect(rowNote(change(), undefined, false)).toBeNull()
  })

  it('у созданного плюс - сколько строк в нём вышло', () => {
    expect(addedShown(change({ created: true, added: 4, removed: 1 }))).toBe(3)
    expect(addedShown(change())).toBe(3)
  })
})

describe('нажатия, ждущие ответа', () => {
  it('пауза объявляет, предохранитель забывает, ответ снимает только своё', () => {
    const presses = new Map([
      ['/p/a', press()],
      ['/p/b', press({ token: 2, at: 1300 })],
    ])

    expect(nextPressEvent(presses, 1000)).toBe(QUIET_PRESS_MS)
    expect(announced(presses, 1200)).toBe(presses)

    const loud = announced(presses, 1000 + QUIET_PRESS_MS)

    expect(loud.get('/p/a')?.announced).toBe(true)
    expect(loud.get('/p/b')?.announced).toBe(false)
    expect(nextPressEvent(loud, 1000 + QUIET_PRESS_MS)).toBe(300)
    expect([...withoutStale(loud, 1000 + PRESS_PATIENCE_MS).keys()]).toEqual(['/p/b'])
    expect([...withoutToken(loud, 1).keys()]).toEqual(['/p/b'])
    expect(nextPressEvent(new Map(), 0)).toBeNull()
  })
})

describe('итог хода в шапке списка', () => {
  it('сумма строк как на строках: у созданного - только плюс, «±» не входит, откаченный входит', () => {
    const totals = turnTotals([
      change({ added: 10, removed: 4 }),
      change({ added: 7, removed: 2, created: true }),
      change({ added: 99, removed: 99, counted: false }),
      change({ added: 1, removed: 3, reverted: true }),
    ])

    expect(totals).toEqual({ added: 16, removed: 7 })
  })

  it('пустой список - нули', () => {
    expect(turnTotals([])).toEqual({ added: 0, removed: 0 })
  })
})
