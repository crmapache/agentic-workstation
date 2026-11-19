import { it, expect, describe } from 'vitest'

import { replyClipboard } from './AssistantMessage.utils'

describe('ответ в буфер', () => {
  it('выделение внутри строки уходит, блоки остаются', () => {
    expect(replyClipboard('**Done**: run `pnpm check`\n\n- one\n- two\n> note')).toBe(
      'Done: run pnpm check\n\n- one\n- two\n> note',
    )
  })

  it('внутри блока кода не трогается ничего', () => {
    const code = '```ts\nconst a = `x` ** 2\n```\n**after**'

    expect(replyClipboard(code)).toBe('```ts\nconst a = `x` ** 2\n```\nafter')
  })

  it('забор закрывает только такой же или длиннее', () => {
    expect(replyClipboard('````\n```\n`in`\n````\n`out`')).toBe('````\n```\n`in`\n````\nout')
  })
})
