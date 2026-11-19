import { useRef, useMemo, useState, useLayoutEffect } from 'react'
import type { RefObject } from 'react'
import { flushSync } from 'react-dom'

import type { FitStep } from './composer-fit.utils'
import { nextFit } from './composer-fit.utils'

/**
 * Метки частей ряда для замера (атрибуты, а не классы: классы принадлежат стилям, и то,
 * что меряется, не должно уезжать при их переименовании). spacer - распорка между
 * квадратами и кнопками хода, в ней запас; clip - часть подписи Send и Queue, которую
 * кнопка отдаёт, сужаясь; step - то, что ряд может отдать.
 */
export const FIT_SPACER = { 'data-fit': 'spacer' }
export const FIT_CLIP = { 'data-fit': 'clip' }
export const fitStepMark = (step: FitStep) => ({ 'data-fit-step': step })

const gapOf = (element: Element) => parseFloat(getComputedStyle(element).columnGap) || 0

/**
 * Насколько ряду не хватает места при Send и Queue во всю ширину: что отдали их подписи,
 * плюс что торчит за краем ряда, минус запас в распорке. Меньше нуля - место есть.
 */
const shortOf = (row: HTMLElement): number | null => {
  const spacer = row.querySelector('[data-fit="spacer"]')
  const last = row.lastElementChild

  if (!spacer || !last) return null

  const edge =
    row.getBoundingClientRect().right - (parseFloat(getComputedStyle(row).paddingRight) || 0)
  const overflow = Math.max(0, last.getBoundingClientRect().right - edge)
  let given = 0

  row.querySelectorAll('[data-fit="clip"]').forEach((clip) => {
    given += Math.max(0, clip.scrollWidth - clip.clientWidth)
  })

  return given + overflow - spacer.getBoundingClientRect().width
}

/**
 * Сколько места вернёт шаг: его коробка и зазор до соседа, а последний в своей группе
 * уносит и группу - тогда зазор между группами. Имя чипа редактора меряется по тексту:
 * ушедшее, оно стоит невидимым без ширины и всё равно знает, сколько ему нужно.
 */
const stepWidth = (row: HTMLElement, step: FitStep): number | null => {
  const element = row.querySelector(`[data-fit-step="${step}"]`)

  if (!element) return null

  let item: Element = element

  // Обёртки без зазора (подсказка вокруг кнопки) - часть шага.
  while (item.parentElement && item.parentElement !== row && gapOf(item.parentElement) === 0) {
    item = item.parentElement
  }

  const group = item.parentElement

  if (!group) return null
  if (step === 'editorName') return element.scrollWidth + gapOf(group)

  if (group !== row && group.children.length === 1 && group.parentElement) {
    return group.getBoundingClientRect().width + gapOf(group.parentElement)
  }

  return item.getBoundingClientRect().width + gapOf(group)
}

/**
 * Следующее число отданных шагов по замеру ряда; null - ряд ещё не собран. Ширины шагов,
 * которые сейчас на месте, запоминаются: ушедший не померить.
 */
const decide = (
  row: HTMLElement,
  level: number,
  steps: readonly FitStep[],
  widths: Map<FitStep, number>,
): number | null => {
  const short = shortOf(row)

  if (short === null) return null

  for (const step of steps) {
    const width = stepWidth(row, step)

    if (width !== null) widths.set(step, width)
  }

  const count = Math.min(level, steps.length)
  const last = steps[count - 1]

  return nextFit(count, steps.length, short, last ? (widths.get(last) ?? 0) : 0)
}

/**
 * Что ряд кнопок поля отдаёт, чтобы влезть в панель (composer-fit.utils.ts). content -
 * всё, что меняет состав ряда (Stop на время хода, Run у «!», язык подписей): ряд меряется
 * заново и тогда, а не только по смене ширины. Меряется до отрисовки: ответ в следующем
 * кадре показывал бы на каждом шаге перетаскивания Send, обрезанный краем панели. Шаг за
 * шагом: после отданного ряд меряется снова, и следующий уходит, только если не хватило.
 */
export const useToolsFit = (
  rowRef: RefObject<HTMLElement | null>,
  steps: readonly FitStep[],
  content: string,
): ReadonlySet<FitStep> => {
  const [level, setLevel] = useState(0)
  const widths = useRef(new Map<FitStep, number>())

  useLayoutEffect(() => {
    const row = rowRef.current

    if (!row || typeof ResizeObserver === 'undefined') return

    const settle = (sync: boolean) => {
      const next = decide(row, level, steps, widths.current)

      if (next === null || next === level) return

      // Из наблюдателя - сразу, до кадра; в самом эффекте раскладки и так до кадра.
      if (sync) flushSync(() => setLevel(next))
      else setLevel(next)
    }
    // Ряд поменял размер или что-то внутри: распорка и подписи кнопок двигаются первыми.
    const observer = new ResizeObserver(() => settle(true))

    settle(false)
    observer.observe(row)
    row.querySelectorAll('[data-fit="spacer"], [data-fit="clip"]').forEach((node) => {
      observer.observe(node)
    })

    return () => observer.disconnect()
  }, [rowRef, level, steps, content])

  return useMemo(() => new Set(steps.slice(0, Math.min(level, steps.length))), [steps, level])
}
