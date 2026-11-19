import { BrowserError } from './browser-error'
import { FIELD_READ, fieldTextOf, asFocusedField, FIELD_TEXT_MAX } from './field-read'
import type { FieldBox, FocusedField } from './field-read'
import { holdMs, keyGapMs, settleMs, TYPE_BY_KEYS_MAX } from './human-motion'
import type { Page } from './page'
import { keyEvents, charEvents } from './page-keys'
import type { KeyEvent } from './page-keys'
import { boxOf, callOn } from './page-nodes'

/**
 * Клавиатура во вкладке (ADR 0040, 0044, 0095): сочетания, набор по клавише и по строкам, и что
 * поле показывает после набора - текстом и картинкой.
 */

const pause = (page: Page, ms: number) => page.motion.sleep(ms, page.signal)

/**
 * Отказ страницы, без которого проверка после набора обойдётся: поле ушло, Chrome не нарисовал
 * вкладку. Stop и отмена вызова - не такие: их видно модели как есть.
 */
const isSkippable = (error: unknown): boolean =>
  error instanceof BrowserError && error.code !== 'stopped' && error.code !== 'aborted'

/**
 * События клавиш с человеческой выдержкой: клавиша держится, модификатор нажат раньше и
 * отпущен позже неё.
 */
const keys = async (page: Page, events: readonly KeyEvent[]) => {
  const held = new Map<string, KeyEvent>()

  try {
    for (const [index, event] of events.entries()) {
      if (index > 0) await pause(page, Math.round(holdMs(page.motion.random) / 2))

      await page.cdp('Input.dispatchKeyEvent', event)

      const id = `${event.code}|${event.key}`

      if (event.type === 'keyUp') held.delete(id)
      else held.set(id, event)
    }
  } finally {
    // Stop посреди сочетания: зажатые клавиши отпускаются, иначе Chrome держал бы ⌘ нажатым.
    for (const { key, code, windowsVirtualKeyCode, modifiers } of [...held.values()].reverse()) {
      await page
        .cdp(
          'Input.dispatchKeyEvent',
          { type: 'keyUp', key, code, windowsVirtualKeyCode, modifiers },
          { unstoppable: true },
        )
        .catch(() => undefined)
    }
  }
}

export const press = async (page: Page, combos: readonly string[]): Promise<void> => {
  for (const [index, combo] of combos.entries()) {
    if (index > 0) await pause(page, keyGapMs(combos[index - 1] ?? '', page.motion.random))

    await keys(page, keyEvents(combo))
  }
}

/**
 * Набрать текст по клавише: короткий - неровным ритмом руки; длинный (slowly для подсказок
 * на сотни знаков) - без пауз между знаками, иначе он печатался бы минутами. paced - ритм руки:
 * строка длинного сообщения его не получает, даже если сама короткая.
 */
const typeByKeys = async (page: Page, text: string, paced: boolean) => {
  let previous = ''

  for (const char of text) {
    if (previous && paced) await pause(page, keyGapMs(previous, page.motion.random))

    await keys(page, charEvents(char))
    previous = char
  }
}

/**
 * Набрать текст в поле с фокусом. Перевод строки - Shift+Enter, пустая строка - два подряд: голый
 * Enter в мессенджере отправил бы сообщение на полуслове. Короткий текст (или slowly) - по
 * клавише, длинный - каждая строка вставкой разом, как из буфера. whole - многострочный текст в
 * textarea: там перевод строки - знак значения, и вставка целиком кладёт его без клавиш.
 */
export const typeInto = async (
  page: Page,
  text: string,
  { slowly, whole }: { slowly: boolean; whole: boolean },
): Promise<void> => {
  const { random } = page.motion

  if (whole && !slowly) {
    await pause(page, settleMs(random))
    await page.cdp('Input.insertText', { text })

    return
  }

  const isShort = text.length <= TYPE_BY_KEYS_MAX
  const lines = text.split('\n')

  for (const [index, line] of lines.entries()) {
    if (index > 0) {
      await pause(page, keyGapMs(lines[index - 1]?.at(-1) ?? '', random))
      await press(page, ['Shift+Enter'])
      await pause(page, keyGapMs('\n', random))
    }

    if (!line) continue

    if (slowly || isShort) {
      await typeByKeys(page, line, isShort)
    } else {
      await pause(page, settleMs(random))
      await page.cdp('Input.insertText', { text: line })
    }
  }
}

/** Поле с фокусом: в документе элемента по ссылке или, без неё, главного фрейма. */
export const focusedField = async (page: Page, ref: string | undefined): Promise<FocusedField> => {
  if (ref) return asFocusedField(await callOn<unknown>(page, ref, FIELD_READ, [FIELD_TEXT_MAX]))

  const result = await page.cdp<{ result?: { value?: unknown } }>('Runtime.evaluate', {
    expression: `(${FIELD_READ}).call(undefined, ${FIELD_TEXT_MAX})`,
    returnByValue: true,
  })

  return asFocusedField(result.result?.value)
}

/** Поля вокруг редактора на картинке: видно его край и соседние кнопки. */
const FIELD_MARGIN = 12

/** Длинная сторона картинки поля: её хватает прочесть строки, а в разговоре она лёгкая. */
const FIELD_SHOT_MAX_SIDE = 1200

/** Картинка поля - подсказка к ответу: не пришла за это время - ответ без неё. */
const FIELD_SHOT_TIMEOUT_MS = 5000

export type FieldPicture = { data: string; mimeType: 'image/png' }

type Viewport = { pageX: number; pageY: number; clientWidth: number; clientHeight: number }

/** Область картинки: поле с полями вокруг, внутри видимой части; не видно - null. */
export const fieldClip = (box: FieldBox, view: Viewport, dpr: number) => {
  const left = Math.max(0, box.x - FIELD_MARGIN)
  const top = Math.max(0, box.y - FIELD_MARGIN)
  const right = Math.min(view.clientWidth, box.x + box.width + FIELD_MARGIN)
  const bottom = Math.min(view.clientHeight, box.y + box.height + FIELD_MARGIN)
  const width = Math.floor(right - left)
  const height = Math.floor(bottom - top)

  if (width < 4 || height < 4) return null

  const scale = Math.min(1, FIELD_SHOT_MAX_SIDE / (Math.max(width, height) * dpr))

  return { x: view.pageX + left, y: view.pageY + top, width, height, scale }
}

/**
 * Картинка редактора, в который только что печатали: модель глазами сверяет строки, пустые
 * строки и чат до Enter. Место - коробка элемента по ссылке (сквозь фреймы) или корня редактора с
 * фокусом. Chrome не нарисовал (вкладка не рисуется, поле ушло) - null, набор от этого не падает.
 */
const fieldPicture = async (
  page: Page,
  ref: string | undefined,
  field: FocusedField,
): Promise<FieldPicture | null> => {
  try {
    const box = ref ? await boxOf(page, ref) : field.box
    const metrics = await page.cdp<{ cssVisualViewport?: Viewport }>('Page.getLayoutMetrics')
    const view = metrics.cssVisualViewport
    const clip = box && view ? fieldClip(box, view, field.dpr) : null

    if (!clip) return null

    const { data } = await page.cdp<{ data: string }>(
      'Page.captureScreenshot',
      { format: 'png', fromSurface: true, captureBeyondViewport: false, clip },
      { timeoutMs: FIELD_SHOT_TIMEOUT_MS },
    )

    return data ? { data, mimeType: 'image/png' } : null
  } catch (error) {
    if (isSkippable(error)) return null

    throw error
  }
}

/** Что поле показывает после набора: текст по строкам и, у редактора, его картинка. */
export type FieldCheck = { text: string; picture: FieldPicture | null }

/**
 * Проверка после набора без submit. Редактор (contenteditable - поле ввода чатов) - всегда:
 * текст по строкам и, если просили, картинка. textarea - текст, когда набрано несколько строк.
 * Однострочное поле - ничего: там нечего сверять. Поле не прочесть - null.
 */
export const checkField = async (
  page: Page,
  ref: string | undefined,
  { multiline, picture }: { multiline: boolean; picture: boolean },
): Promise<FieldCheck | null> => {
  const field = await focusedField(page, ref).catch((error: unknown) => {
    if (isSkippable(error)) return null

    throw error
  })

  if (!field) return null

  const isEditor = field.kind === 'editable'

  if (!isEditor && !(multiline && field.kind === 'textarea')) return null

  return {
    text: fieldTextOf(field),
    picture: isEditor && picture ? await fieldPicture(page, ref, field) : null,
  }
}
