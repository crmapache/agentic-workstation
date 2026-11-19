import { Marked } from 'marked'
import type { Tokens, TokensList, TokenizerAndRendererExtension } from 'marked'

import { readFence, findFenceStart } from './markdown-fences.utils'
import {
  readMathBlock,
  readInlineMath,
  findMathBlockStart,
  findInlineMathStart,
} from './markdown-math.utils'
import type { MathToken } from './Markdown/Markdown.types'

/**
 * Блок кода по правилу ACC (`markdown-fences.utils.ts`) вместо заборов marked: тот
 * закрывает блок забором такой же длины или длиннее и не умеет держать блок в блоке.
 * Токен - обычный `code`, так что всё, что рисует код, не меняется; `lang` - вся
 * инфо-строка, язык - её первое слово.
 */
const fence: TokenizerAndRendererExtension = {
  name: 'accFence',
  level: 'block',
  start: findFenceStart,
  tokenizer(source): Tokens.Code | undefined {
    const block = readFence(source)

    return block ? { type: 'code', raw: block.raw, lang: block.info, text: block.text } : undefined
  },
}

/** Формула отдельным блоком: `$$…$$` и `\[…\]` (`markdown-math.utils.ts`). */
const mathBlock: TokenizerAndRendererExtension = {
  name: 'mathBlock',
  level: 'block',
  start: findMathBlockStart,
  tokenizer(source): MathToken | undefined {
    const math = readMathBlock(source)

    return math ? { type: 'math', raw: math.raw, text: math.latex, display: true } : undefined
  },
}

/**
 * Формула внутри строки: `$…$` и `\(…\)`. Что стоит перед ней - последний знак
 * предыдущего куска строки: marked разбирает строку кусками и соседа слева не даёт.
 */
const mathInline: TokenizerAndRendererExtension = {
  name: 'mathInline',
  level: 'inline',
  start: findInlineMathStart,
  tokenizer(source, tokens): MathToken | undefined {
    if (source[0] !== '$' && !source.startsWith('\\(')) return undefined

    const math = readInlineMath(source, tokens.at(-1)?.raw ?? '')

    return math ? { type: 'math', raw: math.raw, text: math.latex, display: false } : undefined
  },
}

const markdown = new Marked({ gfm: true, extensions: [fence, mathBlock, mathInline] })

/**
 * Токены ответа в разметке Markdown: GFM marked (таблицы, списки, ссылки) плюс заборы
 * кода по правилу ACC и формулы. Формула - токен `math` с LaTeX в `text` и `display`.
 */
export const lexMarkdown = (text: string): TokensList => markdown.lexer(text)
