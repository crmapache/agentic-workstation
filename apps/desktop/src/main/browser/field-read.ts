/**
 * Что поле с фокусом показывает после набора (ADR 0095): вид поля и его текст по строкам, как
 * их увидит адресат. Нужно, чтобы модель проверила абзацы до Enter, не снимая страницу заново.
 *
 * innerText редактора здесь врёт. Lexical (WhatsApp) держит каждую строку своим <p>, а innerText
 * ставит между абзацами пустую строку: «a\n\nb» там, где уйдёт «a\nb». Поэтому текст собирается
 * по устройству редактора: блок (p, div, li - по вычисленному display) - строка, <br> внутри
 * блока - перевод строки, пустой блок (<p><br></p>) - пустая строка. Последний <br> блока строку
 * не добавляет: Chrome и редакторы ставят его заглушкой, чтобы пустая строка имела высоту.
 */

/** Текст поля длиннее - обрезается: модели нужно увидеть абзацы, а не мегабайты документа. */
export const FIELD_TEXT_MAX = 3000

/** Функция страницы: текст редактора по строкам (host - корень редактирования). */
export const EDITOR_TEXT = `function (host) {
  const view = host.ownerDocument.defaultView
  let out = ''
  const walk = (node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === 3) {
        const space = view.getComputedStyle(child.parentElement || host).whiteSpace
        let data = child.data
        if (!/pre|break-spaces/.test(space)) {
          if (!data.trim() && data.includes('\\n')) continue
          data = data.replace(/[\\t\\n\\r ]+/g, ' ')
        }
        out += data.replace(/\\u00a0/g, ' ')
        continue
      }
      if (child.nodeType !== 1) continue
      if (child.nodeName === 'BR') { out += '\\n'; continue }
      if (child.nodeName === 'IMG') { out += child.alt || ''; continue }
      const display = view.getComputedStyle(child).display
      if (display === 'none') continue
      if (!display || display.startsWith('inline') || display === 'contents') { walk(child); continue }
      if (out && !out.endsWith('\\n')) out += '\\n'
      const start = out.length
      walk(child)
      if (out.length > start && out.endsWith('\\n')) out = out.slice(0, -1)
      out += '\\n'
    }
  }
  walk(host)
  return out.endsWith('\\n') ? out.slice(0, -1) : out
}`

/**
 * Функция страницы: поле с фокусом в документе элемента (this) или, без элемента, главного
 * фрейма - сквозь shadow DOM и фреймы того же сайта. Ответ - вид поля, его текст (не длиннее max)
 * и полная длина, место корня редактора в окне документа и плотность пикселей - для картинки.
 */
export const FIELD_READ = `function (max) {
  const editorText = ${EDITOR_TEXT}
  const start = this && this.nodeType === 1 ? this.ownerDocument : document
  let el = start.activeElement
  for (let depth = 0; el && depth < 10; depth += 1) {
    if (el.shadowRoot && el.shadowRoot.activeElement) { el = el.shadowRoot.activeElement; continue }
    let inner = null
    try { inner = el.contentDocument || null } catch (error) { inner = null }
    if (inner && inner.activeElement) { el = inner.activeElement; continue }
    break
  }
  if (!el) return { kind: 'other', text: '', length: 0, box: null, dpr: 1 }
  let host = el
  if (el.isContentEditable) while (host.parentElement && host.parentElement.isContentEditable) host = host.parentElement
  const kind = el.tagName === 'TEXTAREA' ? 'textarea' : el.tagName === 'INPUT' ? 'input' : el.isContentEditable ? 'editable' : 'other'
  const text = kind === 'editable' ? editorText(host) : kind === 'other' ? '' : String(el.value)
  const rect = host.getBoundingClientRect()
  let x = rect.left
  let y = rect.top
  let win = host.ownerDocument.defaultView
  for (let depth = 0; win && depth < 10; depth += 1) {
    let frame = null
    try { frame = win.frameElement } catch (error) { frame = null }
    if (!frame) break
    const outer = frame.getBoundingClientRect()
    const style = frame.ownerDocument.defaultView.getComputedStyle(frame)
    x += outer.left + frame.clientLeft + parseFloat(style.paddingLeft)
    y += outer.top + frame.clientTop + parseFloat(style.paddingTop)
    win = frame.ownerDocument.defaultView
  }
  return {
    kind,
    text: text.slice(0, max),
    length: text.length,
    box: { x, y, width: rect.width, height: rect.height },
    dpr: (start.defaultView && start.defaultView.devicePixelRatio) || 1,
  }
}`

export type FieldKind = 'textarea' | 'input' | 'editable' | 'other'

export type FieldBox = { x: number; y: number; width: number; height: number }

/** Поле с фокусом глазами IDE. box - в окне документа, где функция исполнялась. */
export type FocusedField = {
  kind: FieldKind
  text: string
  length: number
  box: FieldBox | null
  dpr: number
}

const KINDS: readonly FieldKind[] = ['textarea', 'input', 'editable', 'other']

/**
 * Ответ страницы - в поле с фокусом. Чужое (страница переопределила что-то, ответ не того вида) -
 * «не поле»: проверка после набора - подсказка, а не условие набора.
 */
export const asFocusedField = (value: unknown): FocusedField => {
  const raw = (value ?? {}) as Record<string, unknown>
  const kind = KINDS.find((item) => item === raw['kind']) ?? 'other'
  const box = raw['box'] as FieldBox | null | undefined
  const text = typeof raw['text'] === 'string' ? raw['text'] : ''

  return {
    kind,
    text,
    length: typeof raw['length'] === 'number' ? raw['length'] : text.length,
    box: box && [box.x, box.y, box.width, box.height].every(Number.isFinite) ? box : null,
    dpr: typeof raw['dpr'] === 'number' && raw['dpr'] > 0 ? raw['dpr'] : 1,
  }
}

/** Текст поля для модели: обрезанный - с пометкой, сколько не показано. */
export const fieldTextOf = (field: FocusedField): string =>
  field.length > field.text.length
    ? `${field.text}… (${field.length - field.text.length} more characters)`
    : field.text
