import { BrowserError } from './browser-error'
import { targetOf } from './frame-refs'
import type { Page } from './page'
import { frameOffset, revealFrame } from './page-frames'

/**
 * Элементы снимка во вкладке (ADR 0040): команды CDP над узлом, функция страницы на элементе,
 * точка элемента в окне страницы. Узел живёт в документе своего фрейма - команды идут в сессию
 * этого фрейма (у фрейма другого процесса она своя), а точка для мыши - в координатах страницы.
 */

export type Point = { x: number; y: number }

/** Куда нажать: элемент по ссылке снимка или точка в CSS-пикселях окна страницы. */
export type Target = { ref: string } | Point

type CallResult = {
  result?: { value?: unknown }
  exceptionDetails?: { text?: string; exception?: { description?: string } }
}

/** Текст исключения страницы: модель увидит, что сломалось в её выражении. */
export const exceptionText = (details: NonNullable<CallResult['exceptionDetails']>): string =>
  details.exception?.description ?? details.text ?? 'The page threw an exception.'

const goneError = (ref: string) =>
  new BrowserError('bad-request', `Element ${ref} is gone from the page. Take a new snapshot.`)

/**
 * Отказ «узла нет»: страница перестроилась, элемент снимка удалён, или фрейм другого процесса,
 * где он стоял, ушёл вместе с документом.
 */
const isNoNode = (error: unknown): boolean =>
  error instanceof BrowserError &&
  (error.code === 'no-frame' ||
    (error.code === 'cdp' &&
      /no node|node with given id|backend ?id|could not find node/i.test(error.message)))

/** Сессия, где живёт элемент: фрейм другого процесса - своя, иначе - сама вкладка. */
const frameOf = (page: Page, ref: string) => targetOf(page.elementOf(ref).frame)

/**
 * Команда CDP над узлом снимка - в сессии его фрейма. Узла больше нет - модели понятное
 * «элемент пропал, возьми новый снимок», а не текст протокола.
 */
export const nodeCdp = async <T = Record<string, unknown>>(
  page: Page,
  ref: string,
  method: string,
  params: Record<string, unknown> = {},
): Promise<T> => {
  const { node } = page.elementOf(ref)

  try {
    return await page.cdp<T>(
      method,
      { ...params, backendNodeId: node },
      { frame: frameOf(page, ref) },
    )
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
 * отработала бы на невидимом обрывке старой разметки. Функция исполняется в документе фрейма
 * элемента - там, где он стоит.
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

  const call = await page
    .cdp<CallResult>(
      'Runtime.callFunctionOn',
      {
        objectId,
        functionDeclaration: `async function (...args) {
      if (!this.isConnected) return { gone: true }
      return { gone: false, value: await (${functionDeclaration}).apply(this, args) }
    }`,
        arguments: args.map((value) => ({ value })),
        returnByValue: true,
        awaitPromise: true,
        userGesture: true,
      },
      { frame: frameOf(page, ref) },
    )
    .catch((error: unknown) => {
      if (isNoNode(error)) throw goneError(ref)

      throw error
    })

  if (call.exceptionDetails) throw new BrowserError('cdp', exceptionText(call.exceptionDetails))

  const wrapped = call.result?.value as Wrapped | undefined

  if (!wrapped || wrapped.gone) throw goneError(ref)

  return wrapped.value as T
}

/**
 * Элемент - в видимую часть: сначала iframe фреймов другого процесса на пути к нему (прокрутка
 * внутри такого фрейма доходит до страницы не сразу), потом сам элемент в его документе.
 */
export const revealElement = async (page: Page, ref: string): Promise<void> => {
  await revealFrame(page, page.elementOf(ref).frame)
  await nodeCdp(page, ref, 'DOM.scrollIntoViewIfNeeded')
}

const quadArea = (quad: number[]): number => {
  const [x1 = 0, y1 = 0, x2 = 0, y2 = 0, x3 = 0, y3 = 0] = quad

  return Math.abs((x2 - x1) * (y3 - y1) - (x3 - x1) * (y2 - y1))
}

/**
 * Середина элемента в окне страницы; элемент прокручивается в видимую часть. Элемент во
 * фрейме другого процесса: сначала его iframe - в видимую часть страницы, точка - в
 * координатах его окна плюс место фрейма на странице.
 */
export const pointOf = async (page: Page, target: Target): Promise<Point> => {
  if (!('ref' in target)) return target

  const { ref } = target
  const { frame } = page.elementOf(ref)

  await revealElement(page, ref).catch((error: unknown) => {
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

  const offset = await frameOffset(page, frame).catch((error: unknown) => {
    if (isNoNode(error)) throw goneError(ref)

    throw error
  })
  const xs = [quad[0], quad[2], quad[4], quad[6]].map(Number)
  const ys = [quad[1], quad[3], quad[5], quad[7]].map(Number)

  return {
    x: Math.round(offset.x + xs.reduce((sum, value) => sum + value, 0) / 4),
    y: Math.round(offset.y + ys.reduce((sum, value) => sum + value, 0) / 4),
  }
}
