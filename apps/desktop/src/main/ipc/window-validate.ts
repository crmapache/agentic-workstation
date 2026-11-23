import { ACTIVITY_BAR_IDS } from '@shared/window'
import type { BarMenuEntry, BarMenuButton } from '@shared/window'

import { assertOneOf, assertString } from './validate'

const assertArray: (value: unknown, name: string) => asserts value is unknown[] = (value, name) => {
  if (!Array.isArray(value)) throw new Error(`Ожидался список в поле ${name}`)
}

const assertButton = (value: unknown): BarMenuButton => {
  const { id, label, shown } = (value ?? {}) as Record<string, unknown>

  assertString(id, 'id')
  assertString(label, 'label')

  if (typeof shown !== 'boolean') throw new Error('Ожидалось да или нет в поле shown')

  return { id, label, shown }
}

/** Кнопки полос из окна: окно своё, но граница процессов всё равно граница. */
export const assertBarMenu = (value: unknown): BarMenuEntry[] => {
  assertArray(value, 'bars')

  return value.map((entry) => {
    const { bar, groups } = (entry ?? {}) as Record<string, unknown>

    assertArray(groups, 'groups')

    return {
      bar: assertOneOf(bar, ACTIVITY_BAR_IDS, 'bar'),
      groups: groups.map((group) => {
        assertArray(group, 'group')

        return group.map(assertButton)
      }),
    }
  })
}
