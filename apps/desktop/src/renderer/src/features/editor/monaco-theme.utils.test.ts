import { it, expect, describe } from 'vitest'

import { THEME_ROLES } from './monaco-theme.constants'
import type { ThemeColors } from './monaco-theme.types'
import {
  over,
  toHex,
  diffColors,
  tokenRules,
  editorColors,
  fontStyleName,
} from './monaco-theme.utils'

const GREY = { r: 128, g: 128, b: 128, a: 1 }
const colors = Object.fromEntries(Object.keys(THEME_ROLES).map((key) => [key, GREY])) as ThemeColors

describe('цвета темы', () => {
  it('hex с прозрачностью и сведение слоёв', () => {
    expect(toHex({ r: 255, g: 138, b: 82, a: 1 })).toBe('#ff8a52')
    expect(toHex({ r: 255, g: 255, b: 255, a: 0.1 })).toBe('#ffffff1a')
    expect(over({ r: 255, g: 255, b: 255, a: 0.5 }, { r: 0, g: 0, b: 0, a: 1 })).toEqual({
      r: 127.5,
      g: 127.5,
      b: 127.5,
      a: 1,
    })
  })

  it('фон прозрачный, теней нет, всплывающее - непрозрачное', () => {
    const theme = editorColors({ ...colors, overlay: { r: 30, g: 31, b: 35, a: 0.92 } })

    expect(theme['editor.background']).toBe('#00000000')
    expect(
      Object.entries(theme).filter(
        ([key, value]) => key.endsWith('shadow') && value !== '#00000000',
      ),
    ).toEqual([])
    expect(theme['editorWidget.background']).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('миникарта закрывает строки под собой непрозрачным листом', () => {
    const theme = editorColors({
      ...colors,
      app: { r: 10, g: 10, b: 12, a: 1 },
      editor: { r: 255, g: 255, b: 255, a: 0.1 },
    })

    expect(theme['minimap.background']).toBe('#232324')
  })
})

describe('цвета разницы', () => {
  it('строки - подложкой своего тона, отметки на полосе - ярче, теней нет', () => {
    const theme = diffColors(
      { ...colors, success: { r: 143, g: 211, b: 106, a: 1 } },
      { soft: 0.16, border: 0.45 },
    )

    expect(theme['diffEditor.insertedLineBackground']).toBe('#8fd36a29')
    expect(theme['diffEditorOverview.insertedForeground']).toBe('#8fd36a73')
    expect(theme['diffEditor.unchangedRegionShadow']).toBe('#00000000')
  })
})

describe('правила подсветки', () => {
  it('на каждую роль и каждое начертание - правило', () => {
    const rules = tokenRules({ ...colors, syntaxKeyword: { r: 187, g: 166, b: 235, a: 1 } })

    expect(rules).toContainEqual({ token: 'token-keyword', foreground: '#bba6eb', fontStyle: '' })
    expect(rules).toContainEqual({
      token: 'token-keyword.fs3',
      foreground: '#bba6eb',
      fontStyle: 'italic bold',
    })
    expect(fontStyleName(4)).toBe('underline')
    expect(rules).toContainEqual(
      expect.objectContaining({ token: 'token-comment', fontStyle: 'italic' }),
    )
  })
})
