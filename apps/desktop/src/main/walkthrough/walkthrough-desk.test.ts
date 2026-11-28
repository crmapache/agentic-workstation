import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest'

import type { MarkPoint, WalkthroughPanelView } from '@shared/walkthrough'

import type { Aim } from '../computer/computer-agent'
import { ComputerError } from '../computer/computer-error'
import type { Glance } from '../computer/computer-seen'
import type { Scene } from '../computer/screen-scene'
import type { ShowCue } from '../voice/call/call-show'
import { SPEECH_WAIT_MAX_MS } from './walkthrough-call'
import type { WalkthroughCall } from './walkthrough-call'
import { NOT_RUNNING, USER_QUIET_MS, WalkthroughDesk } from './walkthrough-desk'
import { ASK_SILENCE_MS, CRITICAL_SILENCE_MS } from './walkthrough-listen'
import type { StageDrawing } from './walkthrough-stage'
import { WalkthroughStage, FRESH_MARKS_HOLD_MS } from './walkthrough-stage'

const DISPLAY = {
  id: 1,
  bounds: { x: 0, y: 0, width: 1000, height: 800 },
  scaleFactor: 2,
  isMain: true,
}

const WINDOW: Scene = [
  { id: 7, isOrdinary: true, bounds: { x: 0, y: 0, width: 1000, height: 800 } },
]

const CORNERS: [MarkPoint, MarkPoint] = [
  { x: 10, y: 10 },
  { x: 60, y: 30 },
]

/** Дать отработать цепочке обещаний очереди показа. */
const settle = async () => {
  for (let step = 0; step < 20; step += 1) await Promise.resolve()
}

/** Обещание, которое тест сбывает сам. */
const deferred = () => {
  let resolve: (spoken: boolean) => void = () => undefined
  const promise = new Promise<boolean>((settle) => {
    resolve = settle
  })

  return { promise, resolve }
}

/**
 * Голос звонка: «прозвучало» по команде теста. Обёртка звонка - новая на каждый запрос, как у
 * живого моста в ide-features: показ узнаёт звонок по id, а не по объекту.
 */
const voice = () => {
  const turns: Array<(spoken: boolean) => void> = []
  const said: Array<{ text: string; done: (spoken: boolean) => void }> = []
  const cues: ShowCue[] = []
  const listening: boolean[] = []
  const end = vi.fn()
  let hearing = false
  const call = (): WalkthroughCall => ({
    id: 'call1',
    speechSoFar: () => {
      const turn = deferred()

      turns.push(turn.resolve)

      return Promise.resolve({ spoken: turn.promise })
    },
    say: (text) => {
      const phrase = deferred()

      said.push({ text, done: phrase.resolve })

      return { spoken: phrase.promise }
    },
    cue: (cue) => {
      cues.push(cue)

      return { spoken: Promise.resolve(true) }
    },
    listen: (on) => listening.push(on),
    hearing: () => hearing,
    end,
  })

  return {
    call,
    end,
    said,
    cues,
    listening,
    /** Прозвучали слова модели до вызова (или оборваны). */
    hear: (spoken = true) => turns.shift()?.(spoken),
    /** Прозвучала фраза инструмента (или оборвана). */
    speak: (spoken = true) => said.shift()?.done(spoken),
    setHearing: (on: boolean) => {
      hearing = on
    },
  }
}

const harness = (options: { aim?: Aim } = {}) => {
  const line = voice()
  let scene = (): Scene => WINDOW
  let inputAt: number | null = 0
  let quiet: number | null = 10_000
  let touched = false
  const frames: Array<(StageDrawing & { pen: string | null }) | null> = []
  const panels: Array<WalkthroughPanelView | null> = []
  const handOver = vi.fn()
  const backToChat = vi.fn()
  const glance = (): Glance => ({ inputAt, scene: scene() })
  const timer = (run: () => void, ms: number) => {
    const handle = setTimeout(run, ms)

    return () => clearTimeout(handle)
  }
  const stage = new WalkthroughStage({
    windows: {
      marks: {
        show: (_area, draw, pen) => frames.push({ ...draw({ x: 0, y: 0 }), pen }),
        hide: () => frames.push(null),
      },
      panel: { show: (_display, view) => panels.push(view), hide: () => panels.push(null) },
    },
    glance,
    displayAtCursor: () => DISPLAY,
    timer,
    now: () => Date.now(),
  })
  const desk = new WalkthroughDesk({
    computer: {
      aim: () =>
        options.aim ?? {
          display: DISPLAY,
          toScreen: (pixel) => ({ x: pixel.x * 2, y: pixel.y * 2 }),
        },
      glance,
      quietMs: () => quiet,
      touched: () => touched,
      handOver,
    },
    stage,
    timer,
    now: () => Date.now(),
  })

  desk.call = (id) => (id === 'c1' ? line.call() : null)
  desk.backToChat = backToChat
  desk.started('c1')

  return {
    desk,
    line,
    frames,
    panels,
    handOver,
    backToChat,
    lit: () => frames.at(-1)?.lit ?? [],
    setScene: (next: () => Scene) => {
      scene = next
    },
    touch: (at: number, quietMs: number) => {
      inputAt = at
      quiet = quietMs
      touched = true
    },
  }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('WalkthroughDesk: highlights', () => {
  it('refuses to highlight when no walkthrough runs in the chat', async () => {
    const h = harness()

    await expect(h.desk.highlight('other', CORNERS, 'Here', false)).resolves.toEqual({
      refusal: NOT_RUNNING,
      look: false,
    })
  })

  it('asks for a fresh screenshot when the latest one is no longer the screen', async () => {
    const h = harness({ aim: { refusal: 'The user paused you after your latest screenshot.' } })

    await expect(h.desk.highlight('c1', CORNERS, 'Here', false)).resolves.toEqual({
      refusal: 'The user paused you after your latest screenshot.',
      look: true,
    })
  })

  // ADR 0135: фраза о подсветке встаёт в голос сразу, а сама подсветка - когда прозвучали слова до
  // неё, и держится, пока звучит её фраза.
  it('lights the box after the words before it and keeps it while its say is spoken', async () => {
    const h = harness()
    const outcome = await h.desk.highlight('c1', CORNERS, 'This is the menu', false)

    expect(outcome).toHaveProperty('note')
    expect(h.line.said.map((phrase) => phrase.text)).toEqual(['This is the menu'])
    expect(h.lit()).toEqual([])

    await h.desk.highlight('c1', [CORNERS[1], { x: 90, y: 90 }], 'And this is search', false)
    h.line.hear()
    await settle()

    expect(h.lit()).toEqual([{ slot: 0, box: { x: 20, y: 20, width: 100, height: 40 } }])

    // Вторая ждёт, пока прозвучит фраза первой.
    h.line.hear()
    await settle()
    expect(h.lit()).toHaveLength(1)
    expect(h.lit()[0]?.box.x).toBe(20)

    h.line.speak()
    await settle()
    expect(h.lit()).toEqual([{ slot: 0, box: { x: 120, y: 60, width: 60, height: 120 } }])
  })

  it('does not wait for a stuck voice forever', async () => {
    const h = harness()

    await h.desk.highlight('c1', CORNERS, 'Here', false)
    await vi.advanceTimersByTimeAsync(SPEECH_WAIT_MAX_MS)

    expect(h.lit()).toHaveLength(1)
  })

  it('drops the queued highlights once the person talks over one of them', async () => {
    const h = harness()

    await h.desk.highlight('c1', CORNERS, 'One', false)
    await h.desk.highlight('c1', CORNERS, 'Two', false)
    h.line.hear()
    await settle()
    h.line.speak(false)
    h.line.hear()
    await settle()

    expect(h.lit()).toHaveLength(1)
    h.line.speak()
    await settle()
    // Вторая стояла в очереди до того, как человек перебил: её не рисуют.
    expect(h.frames.filter(Boolean)).toHaveLength(1)
  })

  it('keeps several highlights when asked, each in its own slot', async () => {
    const h = harness()

    await h.desk.highlight('c1', CORNERS, 'One', false)
    h.line.hear()
    await settle()
    h.line.speak()
    await h.desk.highlight('c1', [CORNERS[1], { x: 90, y: 90 }], 'Two', true)
    h.line.hear()
    await settle()

    expect(h.lit().map((lit) => lit.slot)).toEqual([0, 1])
  })

  it('skips a highlight when the window under it changed before it was due and tells the model', async () => {
    const h = harness()

    await h.desk.highlight('c1', CORNERS, 'One', false)
    h.setScene(() => [{ ...WINDOW[0]!, id: 8 }])
    h.line.hear()
    await settle()

    expect(h.lit()).toEqual([])

    const next = await h.desk.highlight('c1', CORNERS, 'Two', false)

    expect(next).toMatchObject({ note: expect.stringContaining('was not shown') as string })
  })

  it('clears the highlight when the window under it moves', async () => {
    const h = harness()

    await h.desk.highlight('c1', CORNERS, 'One', false)
    h.line.hear()
    await settle()
    h.setScene(() => [{ ...WINDOW[0]!, bounds: { x: 100, y: 0, width: 900, height: 800 } }])
    await vi.advanceTimersByTimeAsync(500)

    expect(h.frames.at(-1)).toBeNull()
  })
})

describe('WalkthroughDesk: actions', () => {
  it('lets a Computer Use action wait for its words, then clears the highlight', async () => {
    const h = harness()

    await h.desk.highlight('c1', CORNERS, 'One', false)
    h.line.hear()
    await settle()
    h.line.speak()

    const acting = h.desk.beforeAct('c1', new AbortController().signal)

    await settle()
    h.line.hear()
    await acting

    expect(h.frames.at(-1)).toBeNull()
  })

  it('stops a Computer Use action the person talked over', async () => {
    const h = harness()
    const acting = h.desk.beforeAct('c1', new AbortController().signal)

    await settle()
    h.line.hear(false)

    await expect(acting).rejects.toBeInstanceOf(ComputerError)
  })

  it('lets actions of chats without a walkthrough go at once', async () => {
    const h = harness()

    await expect(h.desk.beforeAct('other', new AbortController().signal)).resolves.toBeUndefined()
  })

  // ADR 0135: человек взял инструмент или мышь - он забрал управление на время, ИИ ждёт.
  it('waits while the person holds a pen, and goes on once it is put down', async () => {
    const h = harness()

    h.desk.pick('outline')

    let isDone = false
    const acting = h.desk.beforeAct('c1', new AbortController().signal).then(() => {
      isDone = true
    })

    await settle()
    h.line.hear()
    await vi.advanceTimersByTimeAsync(5000)
    expect(isDone).toBe(false)

    h.desk.pick(null)
    await vi.advanceTimersByTimeAsync(300)
    await acting
    expect(isDone).toBe(true)
  })

  it('waits a little for the words about marks the person just drew', async () => {
    const h = harness()

    h.desk.pick('underline')
    h.desk.stroke('underline', [
      { x: 10, y: 100 },
      { x: 200, y: 100 },
    ])
    h.desk.pick(null)

    let isDone = false
    const acting = h.desk.beforeAct('c1', new AbortController().signal).then(() => {
      isDone = true
    })

    await settle()
    h.line.hear()
    await vi.advanceTimersByTimeAsync(FRESH_MARKS_HOLD_MS - 1000)
    expect(isDone).toBe(false)

    await vi.advanceTimersByTimeAsync(1500)
    await acting
    expect(isDone).toBe(true)
  })

  // Окно на слова считается от последней пометки, а не от начала ожидания действия.
  it('counts the wait for words from the last mark, not from the start of the action', async () => {
    const h = harness()
    let isDone = false

    h.touch(Date.now(), 100)

    const acting = h.desk.beforeAct('c1', new AbortController().signal).then(() => {
      isDone = true
    })

    await settle()
    h.line.hear()
    await vi.advanceTimersByTimeAsync(1000)
    h.desk.pick('outline')
    h.touch(0, 10_000)
    await vi.advanceTimersByTimeAsync(16_000)
    h.desk.stroke('outline', [
      { x: 10, y: 10 },
      { x: 90, y: 60 },
    ])
    h.desk.pick(null)
    await vi.advanceTimersByTimeAsync(FRESH_MARKS_HOLD_MS - 2000)
    expect(isDone).toBe(false)

    await vi.advanceTimersByTimeAsync(2500)
    await acting
    expect(isDone).toBe(true)
  })

  // Человек показал и сказал, пока действие ждало: модель должна сначала посмотреть пометки.
  it('refuses an action once when the person drew and spoke while it waited, and keeps the marks', async () => {
    const h = harness()

    h.desk.pick('outline')

    const acting = h.desk.beforeAct('c1', new AbortController().signal)
    const refused = expect(acting).rejects.toThrow('Call user_marks')

    await settle()
    h.line.hear()
    h.desk.stroke('outline', [
      { x: 10, y: 10 },
      { x: 90, y: 60 },
    ])
    expect(h.desk.drawn('c1')).toBe(1)
    await vi.advanceTimersByTimeAsync(300)

    await refused
    expect(h.frames.at(-1)?.strokes).toHaveLength(1)
    expect(h.desk.userMarks('c1')?.strokes).toMatchObject([{ told: true, seen: true }])

    const next = h.desk.beforeAct('c1', new AbortController().signal)

    await settle()
    h.line.hear()
    await vi.advanceTimersByTimeAsync(300)
    await next
    expect(h.frames.at(-1)).toBeNull()
  })

  it('puts a forgotten pen down before it acts: the marks window would catch its click', async () => {
    const h = harness()

    h.desk.pick('outline')

    const acting = h.desk.beforeAct('c1', new AbortController().signal)

    await settle()
    h.line.hear()
    await vi.advanceTimersByTimeAsync(3 * 60_000 + 1000)
    await acting

    expect(h.desk.panelView().pen).toBeNull()
  })

  it('waits while the person moves the mouse after its screenshot', async () => {
    const h = harness()

    h.touch(Date.now(), 100)

    let isDone = false
    const acting = h.desk.beforeAct('c1', new AbortController().signal).then(() => {
      isDone = true
    })

    await settle()
    h.line.hear()
    await vi.advanceTimersByTimeAsync(1000)
    expect(isDone).toBe(false)

    h.touch(Date.now(), USER_QUIET_MS)
    await vi.advanceTimersByTimeAsync(300)
    await acting
    expect(isDone).toBe(true)
  })
})

describe('WalkthroughDesk: waiting for the person', () => {
  it('gives the mouse to the person and returns what they said while it waited', async () => {
    const h = harness()
    const waiting = h.desk.waitForUser('c1', 60_000)

    await settle()
    h.line.hear()
    await settle()

    expect(h.handOver).toHaveBeenCalledWith('c1')
    expect(h.line.listening).toEqual([true])
    expect(h.desk.intercept('c1', 'Готово')).toBe(true)
    await expect(waiting).resolves.toContain('The user said: "Готово"')
    expect(h.line.listening).toEqual([true, false])
    expect(h.desk.intercept('c1', 'Ещё')).toBe(false)
  })

  it('asks out loud and returns the answer', async () => {
    const h = harness()
    const asking = h.desk.ask('c1', { text: 'Is it clear?', critical: false })

    await settle()
    expect(h.line.said.map((phrase) => phrase.text)).toEqual(['Is it clear?'])
    h.line.speak()
    await settle()

    expect(h.desk.intercept('c1', 'Да')).toBe(true)
    await expect(asking).resolves.toBe('The user answered: "Да".')
  })

  // ADR 0135: молчание на обычный вопрос - согласие, звонок говорит, что идёт дальше.
  it('takes silence for a yes on a plain question', async () => {
    const h = harness()
    const asking = h.desk.ask('c1', { text: 'Is it clear?', critical: false })

    await settle()
    h.line.speak()
    await vi.advanceTimersByTimeAsync(ASK_SILENCE_MS)

    await expect(asking).resolves.toContain('take the silence as a yes')
    expect(h.line.cues).toEqual([{ kind: 'goOn' }])
    expect(h.line.end).not.toHaveBeenCalled()
  })

  it('does not take drawing an answer for silence', async () => {
    const h = harness()
    const asking = h.desk.ask('c1', { text: 'What is unclear?', critical: false })

    await settle()
    h.line.speak()
    await vi.advanceTimersByTimeAsync(2000)
    h.desk.pick('arrow')
    await vi.advanceTimersByTimeAsync(ASK_SILENCE_MS * 2)
    expect(h.line.cues).toEqual([])

    h.desk.stroke('arrow', [
      { x: 100, y: 100 },
      { x: 300, y: 200 },
    ])
    h.desk.intercept('c1', 'Вот это')
    await expect(asking).resolves.toContain('call user_marks')
  })

  it('does not count silence while the person is speaking', async () => {
    const h = harness()
    const asking = h.desk.ask('c1', { text: 'Is it clear?', critical: false })

    await settle()
    h.line.speak()
    h.line.setHearing(true)
    await vi.advanceTimersByTimeAsync(ASK_SILENCE_MS * 2)
    expect(h.line.cues).toEqual([])

    h.desk.intercept('c1', 'Подожди, а это что')
    await expect(asking).resolves.toContain('Подожди')
  })

  // ADR 0135: важный вопрос - повтор, а потом конец показа и возврат к чату.
  it('asks a critical question twice and ends the walkthrough when the person stays silent', async () => {
    const h = harness()
    const asking = h.desk.ask('c1', { text: 'Send it?', critical: true })

    await settle()
    h.line.speak()
    await vi.advanceTimersByTimeAsync(CRITICAL_SILENCE_MS)
    expect(h.line.cues).toEqual([{ kind: 'askAgain', question: 'Send it?' }])
    expect(h.line.end).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(CRITICAL_SILENCE_MS)

    await expect(asking).resolves.toContain('Do not do this step')
    expect(h.line.cues.at(-1)).toEqual({ kind: 'giveUp' })
    expect(h.line.end).toHaveBeenCalledWith('silence')
  })

  it('tells the model to look at the marks the person drew with the answer, and puts the pen down', async () => {
    const h = harness()

    h.desk.pick('arrow')
    h.desk.stroke('arrow', [
      { x: 100, y: 100 },
      { x: 300, y: 200 },
    ])

    const asking = h.desk.ask('c1', { text: 'Which one?', critical: false })

    await settle()
    h.line.speak()
    await settle()
    h.desk.intercept('c1', 'Вот эту')

    await expect(asking).resolves.toContain('call user_marks')
    expect(h.desk.panelView()).toEqual({ pen: null, hasStrokes: true })
    expect(h.desk.userMarks('c1')?.strokes).toMatchObject([{ pen: 'arrow', told: true }])
  })
})

describe('WalkthroughDesk: pens and the end', () => {
  it('shows the pen panel for the walkthrough and draws what the person marks', () => {
    const h = harness()

    expect(h.panels.at(-1)).toEqual({ pen: null, hasStrokes: false })

    h.desk.pick('outline')
    expect(h.frames.at(-1)).toMatchObject({ pen: 'outline', strokes: [] })

    // Случайный щелчок - не пометка.
    h.desk.stroke('outline', [{ x: 5, y: 5 }])
    h.desk.stroke('outline', [
      { x: 10, y: 10 },
      { x: 80, y: 40 },
      { x: 20, y: 60 },
    ])
    expect(h.frames.at(-1)?.strokes).toHaveLength(1)
    expect(h.desk.drawn('c1')).toBe(1)
    expect(h.desk.drawn('c1')).toBe(0)
    expect(h.desk.erase()).toEqual({ pen: null, hasStrokes: false })
  })

  it('hangs up once the last words are spoken', async () => {
    const h = harness()
    const finishing = h.desk.finish('c1')

    await settle()
    h.line.hear()

    await expect(finishing).resolves.toContain('recap')
    expect(h.line.end).toHaveBeenCalled()
  })

  it('keeps the call when the person talks over the last words', async () => {
    const h = harness()
    const finishing = h.desk.finish('c1')

    await settle()
    h.line.hear(false)

    await expect(finishing).resolves.toContain('the call goes on')
    expect(h.line.end).not.toHaveBeenCalled()
  })

  // ADR 0135: конец показа по любой причине возвращает человека к чату.
  it('clears everything and brings the person back to the chat when the call ends', async () => {
    const h = harness()

    await h.desk.highlight('c1', CORNERS, 'One', false)
    h.line.hear()
    await settle()
    h.line.speak()

    const waiting = h.desk.waitForUser('c1', 60_000)

    await settle()
    h.line.hear()
    await settle()
    h.desk.ended('c1', 'lostLine')

    expect(h.frames.at(-1)).toBeNull()
    expect(h.panels.at(-1)).toBeNull()
    expect(h.backToChat).toHaveBeenCalledWith('c1')
    await expect(waiting).resolves.toBe('The walkthrough ended.')
  })

  it('does not bring the IDE up when it is quitting', () => {
    const h = harness()

    h.desk.ended('c1', 'shutdown')

    expect(h.backToChat).not.toHaveBeenCalled()
  })
})
