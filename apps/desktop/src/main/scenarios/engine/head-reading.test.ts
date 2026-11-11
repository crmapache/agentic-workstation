import { it, expect, describe } from 'vitest'

import { judgeHead, judgeCommand } from './head-fence'
import { readReply, replyFlag, replyText, readEndings } from './head-reply'
import { MIN_WAIT_MS, chooseRelief, followsChoice } from './limit-relief'
import { mailWay, askTitle, noteStamp, askAnswers, shownTokens, takeOverVerdict } from './run-mail'
import { addWords, livePiece, newestWords, TurnEndings, BackgroundWork } from './stream-reading'

describe('head reply', () => {
  it('reads the words and the last object, fence and all', () => {
    const reply = readReply('Done, moving on.\n```json\n{"done": true, "path": "a/{b}.ts"}\n```')

    expect(reply.words).toBe('Done, moving on.')
    expect(reply.body).toEqual({ done: true, path: 'a/{b}.ts' })
  })

  it('takes the object from the last ending that has one', () => {
    expect(readEndings(['Report. {"done": true}', 'Polished the style.']).body).toEqual({
      done: true,
    })
  })

  it('reads fields forgivingly', () => {
    expect(replyText({ a: { nested: 1 } }, 'a')).toBe('')
    expect(replyFlag({ a: 'yes' }, 'a')).toBe(true)
    expect(replyFlag({ a: 'maybe' }, 'a')).toBeNull()
  })
})

describe('head fence', () => {
  it('lets the head read and ask git questions', () => {
    expect(judgeCommand('git log --oneline | head -5').ok).toBe(true)
    expect(judgeCommand('pnpm test').ok).toBe(true)
  })

  it('refuses anything that writes, piece by piece', () => {
    expect(judgeCommand('ls && rm -rf .').ok).toBe(false)
    expect(judgeCommand('git -C /repo commit -m x').ok).toBe(false)
    expect(judgeCommand('echo x > file').ok).toBe(false)
    expect(judgeCommand('sed -i s/a/b/ f').ok).toBe(false)
    expect(judgeCommand('python3 -m pip install x').ok).toBe(false)
    expect(judgeCommand('node').ok).toBe(false)
    expect(judgeHead('Write', {}).ok).toBe(false)
  })
})

describe('person and questions', () => {
  it('lets the person’s words in only when the head is free or doing the card itself', () => {
    const state = {
      headUp: true,
      turnOpen: false,
      answeringPerson: false,
      doingCardWork: false,
      waitingOnOthers: true,
    }

    expect(mailWay(state)).toBe('now')
    expect(mailWay({ ...state, turnOpen: true })).toBe('later')
    expect(mailWay({ ...state, turnOpen: true, doingCardWork: true })).toBe('intoWork')
    expect(mailWay({ ...state, answeringPerson: true })).toBe('later')
  })

  it('stamps every note apart and drops picture bytes from the shown chips', () => {
    expect(noteStamp([{ at: 10 } as never], 5)).toBe(11)
    expect(shownTokens([{ kind: 'img', chip: { name: 'a.png', data: 'xx' } }])).toEqual([
      { kind: 'img', chip: { name: 'a.png' } },
    ])
  })

  it('answers a question with options under `answers`, matching a typed label', () => {
    const ask = {
      requestId: 'r',
      toolName: 'AskUserQuestion',
      description: '',
      input: {
        questions: [{ question: 'Where?', options: [{ label: 'Report' }, { label: 'PR only' }] }],
      },
    }

    expect(askTitle(ask)).toBe('Where?')
    expect(askAnswers(ask, 'pr only')).toEqual({ 'Where?': 'PR only' })
    expect(askAnswers({ ...ask, toolName: 'Bash' }, 'x')).toBeNull()
  })

  it('lets a head doing a card’s work ask nobody', () => {
    const head = { onQuestion: 'head', onGiveUp: 'head' } as never

    expect(takeOverVerdict(head, 'AskUserQuestion').ok).toBe(false)
    expect(takeOverVerdict(head, 'Bash').ok).toBe(true)
  })
})

describe('limit relief', () => {
  const free = { refusedUntil: null, fullest: null, twinOfHere: false, runs: null }

  it('stays where it is if it has room, then the person’s choice, then the least spent', () => {
    expect(
      chooseRelief(
        'a',
        'b',
        [
          { ...free, id: 'a' },
          { ...free, id: 'b' },
        ],
        0,
      ),
    ).toEqual({ kind: 'go', account: 'a' })
    expect(
      chooseRelief(
        'a',
        'b',
        [
          { ...free, id: 'a', refusedUntil: 100 },
          { ...free, id: 'b' },
        ],
        0,
      ),
    ).toEqual({ kind: 'go', account: 'b' })
    expect(
      chooseRelief(
        'a',
        'a',
        [
          { ...free, id: 'a', refusedUntil: 100 },
          { ...free, id: 'c', fullest: 80 },
          { ...free, id: 'd', fullest: 20 },
        ],
        0,
      ),
    ).toEqual({ kind: 'go', account: 'd' })
  })

  it('waits for the first reset when nobody has room, a twin refusing with its pair', () => {
    expect(
      chooseRelief(
        'a',
        'a',
        [
          { ...free, id: 'a', refusedUntil: 500_000 },
          { ...free, id: 'b', twinOfHere: true },
        ],
        0,
      ),
    ).toEqual({ kind: 'wait', at: 500_000 })
    expect(chooseRelief('a', 'a', [{ ...free, id: 'a', refusedUntil: 10 }], 0)).toEqual({
      kind: 'wait',
      at: MIN_WAIT_MS,
    })
  })

  it('follows a new choice, and a re-sent one only off a borrowed account', () => {
    expect(followsChoice('b', 'a', false, false)).toBe(true)
    expect(followsChoice('a', 'a', false, false)).toBe(false)
    expect(followsChoice('a', 'a', true, false)).toBe(true)
  })
})

describe('stream reading', () => {
  const assistant = (id: string, text: string) => ({
    type: 'assistant',
    message: { id, content: [{ type: 'text', text }] },
  })
  const endTurn = {
    type: 'stream_event',
    event: { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
  }

  it('keeps every ending of a turn a hook sent back to work', () => {
    const endings = new TurnEndings()

    endings.read(assistant('m1', 'Report'))
    endings.read(endTurn)
    endings.read(assistant('m2', 'Style pass'))
    endings.read(endTurn)
    endings.read({ type: 'result', result: 'Style pass' })

    expect(endings.last).toEqual(['Report', 'Style pass'])
  })

  it('waits for helpers that report and lets a set of tasks replace the pairs', () => {
    const work = new BackgroundWork()

    work.read({ type: 'system', subtype: 'task_started', task_id: 't1', task_type: 'local_agent' })
    expect(work.busy()).toBe(true)
    work.read({
      type: 'system',
      subtype: 'background_tasks_changed',
      tasks: [{ task_id: 'b', task_type: 'local_bash' }],
    })
    expect(work.busy()).toBe(false)
  })

  it('keeps the newest words, cut at a paragraph, a code fence opened again', () => {
    expect(
      livePiece({
        type: 'stream_event',
        event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'hi' } },
      }),
    ).toBe('hi')
    expect(addWords('one', '\n\n', 100)).toBe('one\n\n')
    expect(newestWords(`${'a'.repeat(20)}\n\nnewest words`, 16)).toBe('newest words')
    expect(newestWords(`\`\`\`ts\n${'x'.repeat(30)}\nline`, 12).startsWith('```ts')).toBe(true)
  })
})
