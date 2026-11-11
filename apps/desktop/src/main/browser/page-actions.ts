import { BrowserError } from './browser-error'
import { SET_VALUE, setsValue, sameFieldValue, fieldValueRefused } from './field-values'
import type { Page } from './page'
import { keyEvents, charEvents } from './page-keys'

/**
 * Действия во вкладке через CDP (ADR 0040): клики и ввод - `Input.*`, как от настоящей мыши и
 * клавиатуры; сайты их не отличают. Перед нажатием курсор агента подъезжает к точке.
 */

export type Point = { x: number; y: number }

/** Куда нажать: элемент по ссылке снимка или точка в CSS-пикселях окна страницы. */
export type Target = { ref: string } | Point

export type MouseButton = 'left' | 'right' | 'middle'

const BUTTON_MASK: Record<MouseButton, number> = { left: 1, right: 2, middle: 4 }

type CallResult = {
  result?: { value?: unknown }
  exceptionDetails?: { text?: string; exception?: { description?: string } }
}

/** Текст исключения страницы: модель увидит, что сломалось в её выражении. */
export const exceptionText = (details: NonNullable<CallResult['exceptionDetails']>): string =>
  details.exception?.description ?? details.text ?? 'The page threw an exception.'

const goneError = (ref: string) =>
  new BrowserError('bad-request', `Element ${ref} is gone from the page. Take a new snapshot.`)

/** Отказ CDP «узла нет»: страница перестроилась, элемент снимка удалён. */
const isNoNode = (error: unknown): boolean =>
  error instanceof BrowserError &&
  error.code === 'cdp' &&
  /no node|node with given id|backend ?id|could not find node/i.test(error.message)

/**
 * Команда CDP над узлом снимка. Узла больше нет - модели понятное «элемент пропал, возьми новый
 * снимок», а не текст протокола.
 */
export const nodeCdp = async <T = Record<string, unknown>>(
  page: Page,
  ref: string,
  method: string,
  params: Record<string, unknown> = {},
): Promise<T> => {
  try {
    return await page.cdp<T>(method, { ...params, backendNodeId: page.nodeOf(ref) })
  } catch (error) {
    if (isNoNode(error)) throw goneError(ref)

    throw error
  }
}

/** Ответ обёртки callOn: элемент выпал из документа - знак, а не значение. */
type Wrapped = { gone: true } | { gone: false; value: unknown }

/**
 * Вызвать функцию страницы на элементе (this) и вернуть значение. Элемент, выпавший из
 * документа (isConnected), - тоже «пропал»: узел ещё жив в памяти страницы, и функция молча
 * отработала бы на невидимом обрывке старой разметки.
 */
export const callOn = async <T>(
  page: Page,
  ref: string,
  functionDeclaration: string,
  args: unknown[] = [],
): Promise<T> => {
  const resolved = await nodeCdp<{ object: { objectId?: string } }>(
    page,
    ref,
    'DOM.resolveNode',
  ).catch((error: unknown) => {
    if (error instanceof BrowserError && error.code !== 'cdp') throw error

    return null
  })
  const objectId = resolved?.object.objectId

  if (!objectId) throw goneError(ref)

  const call = await page.cdp<CallResult>('Runtime.callFunctionOn', {
    objectId,
    functionDeclaration: `async function (...args) {
      if (!this.isConnected) return { gone: true }
      return { gone: false, value: await (${functionDeclaration}).apply(this, args) }
    }`,
    arguments: args.map((value) => ({ value })),
    returnByValue: true,
    awaitPromise: true,
    userGesture: true,
  })

  if (call.exceptionDetails) throw new BrowserError('cdp', exceptionText(call.exceptionDetails))

  const wrapped = call.result?.value as Wrapped | undefined

  if (!wrapped || wrapped.gone) throw goneError(ref)

  return wrapped.value as T
}

const quadArea = (quad: number[]): number => {
  const [x1 = 0, y1 = 0, x2 = 0, y2 = 0, x3 = 0, y3 = 0] = quad

  return Math.abs((x2 - x1) * (y3 - y1) - (x3 - x1) * (y2 - y1))
}

/** Середина элемента в окне страницы; элемент прокручивается в видимую часть. */
export const pointOf = async (page: Page, target: Target): Promise<Point> => {
  if (!('ref' in target)) return target

  const { ref } = target

  await nodeCdp(page, ref, 'DOM.scrollIntoViewIfNeeded').catch((error: unknown) => {
    if (error instanceof BrowserError && error.code === 'bad-request') throw error
  })

  const { quads } = await nodeCdp<{ quads: number[][] }>(page, ref, 'DOM.getContentQuads').catch(
    (error: unknown) => {
      if (error instanceof BrowserError && error.code === 'bad-request') throw error

      return { quads: [] as number[][] }
    },
  )
  const quad = quads.find((item) => quadArea(item) > 1)

  if (!quad) {
    throw new BrowserError('bad-request', `Element ${target.ref} is not visible on the page.`)
  }

  const xs = [quad[0], quad[2], quad[4], quad[6]].map(Number)
  const ys = [quad[1], quad[3], quad[5], quad[7]].map(Number)

  return {
    x: Math.round(xs.reduce((sum, value) => sum + value, 0) / 4),
    y: Math.round(ys.reduce((sum, value) => sum + value, 0) / 4),
  }
}

const mouse = (
  page: Page,
  type: 'mouseMoved' | 'mousePressed' | 'mouseReleased',
  { x, y }: Point,
  button: MouseButton | 'none',
  clickCount: number,
) =>
  page.cdp('Input.dispatchMouseEvent', {
    type,
    x,
    y,
    button,
    clickCount,
    buttons: type === 'mousePressed' && button !== 'none' ? BUTTON_MASK[button] : 0,
  })

export const click = async (
  page: Page,
  target: Target,
  { button = 'left', double = false }: { button?: MouseButton; double?: boolean } = {},
): Promise<void> => {
  const point = await pointOf(page, target)

  await page.cursor(point.x, point.y, double ? 'double' : button === 'right' ? 'right' : 'click')
  await mouse(page, 'mouseMoved', point, 'none', 0)

  for (const count of double ? [1, 2] : [1]) {
    await mouse(page, 'mousePressed', point, button, count)
    await mouse(page, 'mouseReleased', point, button, count)
  }
}

export const hover = async (page: Page, target: Target): Promise<void> => {
  const point = await pointOf(page, target)

  await page.cursor(point.x, point.y, 'move')
  await mouse(page, 'mouseMoved', point, 'none', 0)
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

export const press = async (page: Page, combos: readonly string[]): Promise<void> => {
  for (const combo of combos) {
    for (const event of keyEvents(combo)) await page.cdp('Input.dispatchKeyEvent', event)
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
 * Ввод: нажать в поле (курсор подъезжает), заменить содержимое (или дописать), набрать. Обычно
 * текст вставляется разом (`Input.insertText`); slowly - по клавише, для полей с подсказками.
 * Поле даты, времени, цвета или ползунка не печатает - ему значение ставится целиком.
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

  if (options.slowly) {
    for (const char of options.text) {
      for (const event of charEvents(char)) await page.cdp('Input.dispatchKeyEvent', event)
    }
  } else if (options.text) {
    await page.cdp('Input.insertText', { text: options.text })
  } else if (options.ref && !options.append) {
    await press(page, ['Delete'])
  }

  if (options.submit) await press(page, ['Enter'])
}

/** Выбрать варианты в <select> по значению или подписи; ответ - выбранные значения. */
const SELECT_OPTIONS = `function (values) {
  if (!(this instanceof HTMLSelectElement)) throw new Error('The element is not a <select>: click it and pick the option instead.')
  const wanted = new Set(values)
  const options = [...this.options]
  const matched = options.filter((option) => wanted.has(option.value) || wanted.has(option.label) || wanted.has(option.text.trim()))
  if (!matched.length) throw new Error('No option matches ' + values.join(', ') + '. Options: ' + options.map((option) => option.label || option.value).join(', '))
  for (const option of options) option.selected = this.multiple ? matched.includes(option) : option === matched[0]
  this.dispatchEvent(new Event('input', { bubbles: true }))
  this.dispatchEvent(new Event('change', { bubbles: true }))
  return matched.map((option) => option.value)
}`

export const selectOptions = (page: Page, ref: string, values: readonly string[]) =>
  callOn<string[]>(page, ref, SELECT_OPTIONS, [values])

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

/** Прокрутка колесом в точке (по умолчанию - середина окна) или до элемента. */
export const scroll = async (
  page: Page,
  { ref, point, dx, dy }: { ref?: string; point?: Point; dx: number; dy: number },
): Promise<void> => {
  if (ref && !dx && !dy) {
    await nodeCdp(page, ref, 'DOM.scrollIntoViewIfNeeded')

    return
  }

  const at = ref ? await pointOf(page, { ref }) : (point ?? (await viewportCenter(page)))

  await page.cursor(at.x, at.y, 'move')
  await page.cdp('Input.dispatchMouseEvent', {
    type: 'mouseWheel',
    x: at.x,
    y: at.y,
    deltaX: dx,
    deltaY: dy,
  })
}

const viewportCenter = async (page: Page): Promise<Point> => {
  const metrics = await page.cdp<{
    cssLayoutViewport?: { clientWidth: number; clientHeight: number }
  }>('Page.getLayoutMetrics')
  const viewport = metrics.cssLayoutViewport ?? { clientWidth: 800, clientHeight: 600 }

  return { x: Math.round(viewport.clientWidth / 2), y: Math.round(viewport.clientHeight / 2) }
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
