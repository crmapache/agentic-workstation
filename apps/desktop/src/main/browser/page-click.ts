import { BrowserError } from './browser-error'
import { judge, hitLabel } from './click-check'
import type { Hit, ClickAim } from './click-check'
import { holdMs, settleMs, doubleGapMs } from './human-motion'
import type { Page } from './page'
import { hitAt } from './page-hit'
import type { Point, Target } from './page-nodes'
import { mouse, moveTo } from './page-pointer'
import type { MouseButton } from './page-pointer'
import { aimOf } from './page-reveal'

/**
 * Клик во вкладке (ADR 0040, 0044, 0119): мышь идёт к цели путём руки, держит кнопку - и прямо
 * перед каждым нажатием проверяет, что под ней. Пока мышь ехала, страница могла перерисоваться,
 * и под точкой оказалась бы соседняя кнопка («Rechazar» вместо «Aceptar»): нажатие в неё не
 * уходит. Ответ - что нажато.
 */

export type ClickOptions = {
  button?: MouseButton
  double?: boolean
  /** Подпись того, что модель хочет нажать: под точкой должно быть так названное. */
  expect?: string | undefined
}

const pause = (page: Page, ms: number) => page.motion.sleep(ms, page.signal)

/** Отказы, после которых проверять нечего: вызов оборван, связи нет. */
const FATAL = new Set(['aborted', 'stopped', 'profile-offline'])

/**
 * Что под точкой. Страница не ответила на проверку - попадание неизвестно: по ref и с expect
 * это отказ (judge), по x,y без expect - клик, как раньше, с «ничего, что страница называет».
 */
const look = (page: Page, point: Point): Promise<Hit | null> =>
  hitAt(page, point).catch((error: unknown) => {
    if (error instanceof BrowserError && FATAL.has(error.code)) throw error

    console.warn('[browser] hit test failed:', error)

    return null
  })

/** Отказ модели: что под мышью, что уже нажато (у двойного клика) и что делать дальше. */
const refused = (verdict: { reason: string; next: string }, firstPress: Hit | null | undefined) => {
  const done =
    firstPress === undefined
      ? 'Nothing was clicked.'
      : `The first click of the double click went to ${hitLabel(firstPress)}, the second was not sent.`

  return new BrowserError('bad-request', `${verdict.reason} ${done} ${verdict.next}`)
}

/**
 * Нажать (у двойного клика - дважды), сверяя попадание перед каждым нажатием. Клик по ref, ушедший
 * из-под мыши, один раз прицеливается заново - элемент мог доехать до места, пока мышь шла; снова
 * не он - отказ. Ответ - попадание первого нажатия словами: `button "Aceptar"`.
 */
export const click = async (
  page: Page,
  target: Target,
  { button = 'left', double = false, expect }: ClickOptions = {},
): Promise<string> => {
  const aim: ClickAim =
    'ref' in target
      ? { ref: target.ref, ...(expect !== undefined ? { expect } : {}) }
      : { point: target, ...(expect !== undefined ? { expect } : {}) }
  const element = 'ref' in target ? page.elementOf(target.ref) : null
  const action = double ? 'double' : button === 'right' ? 'right' : 'click'
  const { random } = page.motion
  let point = await aimOf(page, target)
  let firstPress: Hit | null | undefined

  await moveTo(page, point, action)
  await pause(page, settleMs(random))

  for (const count of double ? [1, 2] : [1]) {
    if (count > 1) await pause(page, doubleGapMs(random))

    let hit = await look(page, point)
    let verdict = judge(aim, hit, element)

    if (!verdict.ok && verdict.reaim && count === 1) {
      point = await aimOf(page, target)
      await moveTo(page, point, action)
      await pause(page, settleMs(random))
      hit = await look(page, point)
      verdict = judge(aim, hit, element)
    }

    if (!verdict.ok) throw refused(verdict, firstPress)

    await mouse(page, 'mousePressed', point, button, count)

    try {
      await pause(page, holdMs(random))
    } finally {
      await mouse(page, 'mouseReleased', point, button, count)
    }

    if (firstPress === undefined) firstPress = hit
  }

  return hitLabel(firstPress ?? null)
}
