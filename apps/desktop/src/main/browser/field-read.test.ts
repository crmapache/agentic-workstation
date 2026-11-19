import { runInThisContext } from 'node:vm'

import { Window } from 'happy-dom'
import { it, expect, describe } from 'vitest'

import { FIELD_READ, EDITOR_TEXT, fieldTextOf, asFocusedField } from './field-read'

/** Функция страницы - функцией теста: та же строка, что уходит в Chrome. */
const pageFunction = <T>(source: string) => runInThisContext(`(${source})`) as T

const editorText = pageFunction<(host: unknown) => string>(EDITOR_TEXT)
const fieldRead = pageFunction<(this: unknown, max: number) => unknown>(FIELD_READ)

const { document } = new Window()

const editor = (html: string) => {
  const host = document.createElement('div')

  host.contentEditable = 'true'
  host.innerHTML = html
  document.body.replaceChildren(host)

  return host
}

/** Поле с фокусом глазами страницы: функция исполняется на элементе её документа. */
const focused = (max = 100) => asFocusedField(fieldRead.call(document.body, max))

describe('текст редактора по строкам', () => {
  // Lexical (WhatsApp) держит строку своим <p>: innerText показал бы «a\n\nb», а уйдёт «a\nb».
  it('абзацы Lexical - строки, пустой абзац - пустая строка', () => {
    expect(editorText(editor('<p><span>a</span></p><p><span>b</span></p>'))).toBe('a\nb')
    expect(editorText(editor('<p>a</p><p><br></p><p>b</p>'))).toBe('a\n\nb')
    expect(
      editorText(editor('<p>Hi Ana,</p><p><br></p><p>1. When?</p><p>2. Where?</p><p><br></p>')),
    ).toBe('Hi Ana,\n\n1. When?\n2. Where?\n')
  })

  it('перевод строки внутри абзаца - <br>, последний <br> блока - заглушка, а не строка', () => {
    expect(editorText(editor('<p>a<br>b</p>'))).toBe('a\nb')
    expect(editorText(editor('<p>a<br><br>b</p>'))).toBe('a\n\nb')
    expect(editorText(editor('<p>a<br></p><p>b</p>'))).toBe('a\nb')
    expect(editorText(editor('<p><span>a</span><br><span>b</span></p>'))).toBe('a\nb')
  })

  it('редактор Chrome без своей разметки: <br> и блоки <div>', () => {
    expect(editorText(editor('a<br><br>b'))).toBe('a\n\nb')
    expect(editorText(editor('a<br><br>'))).toBe('a\n')
    expect(editorText(editor('first<div>second</div><div><br></div><div>third</div>'))).toBe(
      'first\nsecond\n\nthird',
    )
  })

  it('неразрывный пробел - пробел, отступы разметки - не текст, эмодзи-картинка - её alt', () => {
    expect(editorText(editor('a&nbsp; b'))).toBe('a  b')
    expect(editorText(editor('\n  <p>one</p>\n  <p>two</p>\n'))).toBe('one\ntwo')
    expect(editorText(editor('<p>ok <img alt="👍" src="x.png"></p>'))).toBe('ok 👍')
    expect(editorText(editor('<p>shown</p><p style="display:none">hidden</p>'))).toBe('shown')
  })
})

describe('поле с фокусом', () => {
  it('редактор - его текст по строкам; textarea и input - значение', () => {
    editor('<p>a</p><p><br></p><p>b</p>').focus()

    expect(focused()).toMatchObject({ kind: 'editable', text: 'a\n\nb', length: 4 })

    const area = document.createElement('textarea')

    area.value = 'one\n\ntwo'
    document.body.replaceChildren(area)
    area.focus()

    expect(focused()).toMatchObject({ kind: 'textarea', text: 'one\n\ntwo' })

    const input = document.createElement('input')

    document.body.replaceChildren(input)
    input.focus()

    expect(focused().kind).toBe('input')
  })

  it('длинный текст обрезается с пометкой; чужой ответ страницы - «не поле»', () => {
    editor(`<p>${'x'.repeat(50)}</p>`).focus()

    expect(fieldTextOf(focused(10))).toBe(`${'x'.repeat(10)}… (40 more characters)`)
    expect(asFocusedField({ tag: 'input', type: 'text' })).toMatchObject({
      kind: 'other',
      box: null,
    })
  })
})
