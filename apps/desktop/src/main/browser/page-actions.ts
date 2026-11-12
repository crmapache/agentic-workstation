import { BrowserError } from './browser-error'
import { SET_VALUE, setsValue, sameFieldValue, fieldValueRefused } from './field-values'
import { holdMs, pickMs, keyGapMs, settleMs, doubleGapMs, TYPE_BY_KEYS_MAX } from './human-motion'
import type { Page } from './page'
import { keyEvents, charEvents } from './page-keys'
import type { KeyEvent } from './page-keys'
import { callOn, nodeCdp } from './page-nodes'
import type { Point, Target } from './page-nodes'
import { mouse, wheel, moveTo, viewportOf } from './page-pointer'
import type { MouseButton } from './page-pointer'
import { aimOf, revealByHand } from './page-reveal'

/**
 * Действия во вкладке через CDP (ADR 0040, 0044): клики и ввод - `Input.*`, как от настоящей
 * мыши и клавиатуры. Рука - как у человека (human-motion.ts): мышь идёт к цели путём, жмёт
 * не в центр и держит кнопку, текст печатается по клавише, колесо крутится толчками. Ввод
 * всегда идёт в саму вкладку, и во фрейм другого процесса тоже: Chrome сам отдаёт его фрейму
 * под точкой или в фокусе.
 */

export type { MouseButton } from './page-pointer'

const pause = (page: Page, ms: number) => page.motion.sleep(ms, page.signal)

export const click = async (
  page: Page,
  target: Target,
  { button = 'left', double = false }: { button?: MouseButton; double?: boolean } = {},
): Promise<void> => {
  const point = await aimOf(page, target)
  const { random } = page.motion

  await moveTo(page, point, double ? 'double' : button === 'right' ? 'right' : 'click')
  await pause(page, settleMs(random))

  for (const count of double ? [1, 2] : [1]) {
    if (count > 1) await pause(page, doubleGapMs(random))

    await mouse(page, 'mousePressed', point, button, count)

    try {
      await pause(page, holdMs(random))
    } finally {
      await mouse(page, 'mouseReleased', point, button, count)
    }
  }
}

export const hover = async (page: Page, target: Target): Promise<void> => {
  await moveTo(page, await aimOf(page, target), 'move')
}

/**
 * Рука подходит к полю и нажимает в нём только курсором на экране: список, дата, цвет и
 * ползунок получают значение напрямую. Настоящее нажатие открыло бы родное окно Chrome (список
 * вариантов, палитру), которого не видят ни страница, ни отладчик, - оно повисло бы у человека.
 */
const reach = async (page: Page, ref: string) => {
  await moveTo(page, await aimOf(page, { ref }), 'click')
  await pause(page, settleMs(page.motion.random))
}

/** Выделить содержимое поля: набранное заменит его, как у человека после ⌘A. */
const SELECT_CONTENTS = `function () {
  if (typeof this.select === 'function' && 'value' in this) { this.focus(); this.select(); return }
  if (this.isContentEditable) {
    this.focus()
    const range = document.createRange()
    range.selectNodeContents(this)
    const selection = getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
  }
}`

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
 * на сотни знаков) - без пауз между знаками, иначе он печатался бы минутами.
 */
const typeByKeys = async (page: Page, text: string) => {
  const paced = text.length <= TYPE_BY_KEYS_MAX
  let previous = ''

  for (const char of text) {
    if (previous && paced) await pause(page, keyGapMs(previous, page.motion.random))

    await keys(page, charEvents(char))
    previous = char
  }
}

export type TypeOptions = {
  ref?: string
  text: string
  submit?: boolean
  slowly?: boolean
  append?: boolean
}

const DESCRIBE = `function () {
  return { tag: this.tagName.toLowerCase(), type: String(this.type || '').toLowerCase(), checked: this.checked === true }
}`

type FieldInfo = { tag: string; type: string; checked: boolean }

/**
 * Значение поля даты, времени, цвета или ползунка - напрямую (field-values.ts), с проверкой:
 * не взяло - отказ с форматом, который ждёт поле.
 */
const setFieldValue = async (page: Page, ref: string, type: string, value: string) => {
  await reach(page, ref)

  const result = await callOn<{ value: string; min: string; max: string; step: string }>(
    page,
    ref,
    SET_VALUE,
    [value.trim()],
  )

  if (!sameFieldValue(type, result.value, value)) {
    throw new BrowserError('bad-request', fieldValueRefused(type, value, result.value, result))
  }
}

/**
 * Ввод: нажать в поле (мышь подъезжает), заменить содержимое (или дописать), набрать. Короткий
 * текст печатается по клавише - с нажатиями, которые видят сайт и его подсказки; длинный (или
 * с переводами строк) вставляется разом, как человек вставил бы его из буфера. slowly - по
 * клавише всегда. Поле даты, времени, цвета или ползунка не печатает - ему значение ставится
 * целиком.
 */
export const typeText = async (page: Page, options: TypeOptions): Promise<void> => {
  const field = options.ref ? await callOn<FieldInfo>(page, options.ref, DESCRIBE) : null

  if (options.ref && field && setsValue(field.tag, field.type)) {
    await setFieldValue(page, options.ref, field.type, options.text)

    if (options.submit) await press(page, ['Enter'])

    return
  }

  if (options.ref) {
    await click(page, { ref: options.ref })

    if (!options.append) await callOn(page, options.ref, SELECT_CONTENTS)
  }

  const byKeys =
    options.slowly || (options.text.length <= TYPE_BY_KEYS_MAX && !options.text.includes('\n'))

  if (options.text && byKeys) {
    await typeByKeys(page, options.text)
  } else if (options.text) {
    await pause(page, settleMs(page.motion.random))
    await page.cdp('Input.insertText', { text: options.text })
  } else if (options.ref && !options.append) {
    await press(page, ['Delete'])
  }

  if (options.submit) {
    await pause(page, keyGapMs(options.text.at(-1) ?? '', page.motion.random))
    await press(page, ['Enter'])
  }
}

/** Выбрать варианты в <select> по значению или подписи; ответ - выбранные значения. */
const SELECT_OPTIONS = `function (values) {
  if (!(this instanceof HTMLSelectElement)) throw new Error('The element is not a <select>: click it and pick the option instead.')
  this.focus()
  const wanted = new Set(values)
  const options = [...this.options]
  const matched = options.filter((option) => wanted.has(option.value) || wanted.has(option.label) || wanted.has(option.text.trim()))
  if (!matched.length) throw new Error('No option matches ' + values.join(', ') + '. Options: ' + options.map((option) => option.label || option.value).join(', '))
  for (const option of options) option.selected = this.multiple ? matched.includes(option) : option === matched[0]
  this.dispatchEvent(new Event('input', { bubbles: true }))
  this.dispatchEvent(new Event('change', { bubbles: true }))
  return matched.map((option) => option.value)
}`

/**
 * Выбор в списке рукой: курсор подходит и нажимает, пауза - человек смотрит на раскрытый
 * список, - и вариант выбран. Ответ - выбранные значения.
 */
export const selectOptions = async (page: Page, ref: string, values: readonly string[]) => {
  await reach(page, ref)
  await pause(page, pickMs(page.motion.random))

  return callOn<string[]>(page, ref, SELECT_OPTIONS, [values])
}

/**
 * Значение поля формы словами модели: флажок - true/false, список - вариант, дата, время, цвет
 * и ползунок - значение в своём формате, иначе текст.
 */
export const fillField = async (page: Page, ref: string, value: string): Promise<void> => {
  const field = await callOn<FieldInfo>(page, ref, DESCRIBE)

  if (setsValue(field.tag, field.type)) {
    await setFieldValue(page, ref, field.type, value)

    return
  }

  if (field.tag === 'select') {
    await selectOptions(page, ref, [value])

    return
  }

  if (field.type === 'checkbox' || field.type === 'radio') {
    const wanted = /^(true|on|yes|checked|1)$/i.test(value.trim())

    if (field.checked !== wanted) await click(page, { ref })

    return
  }

  await typeText(page, { ref, text: value })
}

/**
 * Прокрутка колесом в точке (по умолчанию - там, где мышь, или середина окна) или до элемента
 * (page-reveal.ts). Мышь сначала приходит в точку, колесо крутится серией толчков, как
 * трекпад, а не одним прыжком на всю высоту.
 */
export const scroll = async (
  page: Page,
  { ref, point, dx, dy }: { ref?: string; point?: Point; dx: number; dy: number },
): Promise<void> => {
  if (ref && !dx && !dy) {
    await revealByHand(page, ref)

    return
  }

  const at = ref
    ? await aimOf(page, { ref })
    : (point ?? page.tab.pointer ?? (await viewportCenter(page)))

  await moveTo(page, at, 'move')
  await wheel(page, at, dx, dy)
}

const viewportCenter = async (page: Page): Promise<Point> => {
  const { width, height } = await viewportOf(page)

  return { x: Math.round(width / 2), y: Math.round(height / 2) }
}

const IS_FILE_INPUT = `function () {
  return this instanceof HTMLInputElement && this.type === 'file'
}`

/**
 * Файлы с диска в поле выбора файла - без системного окна. Сначала - что элемент на месте и
 * это поле файла: по устаревшей ссылке файл ушёл бы в чужое поле.
 */
export const uploadFiles = async (page: Page, ref: string, files: readonly string[]) => {
  if (!(await callOn<boolean>(page, ref, IS_FILE_INPUT))) {
    throw new BrowserError('bad-request', `Element ${ref} is not a file input.`)
  }

  await nodeCdp(page, ref, 'DOM.setFileInputFiles', { files: [...files] })
}
