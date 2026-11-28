import type { MarkBox, MarkPoint } from '@shared/walkthrough'

import { ToolOutput } from '../native-tools'
import type { NativeCall } from '../native-tools'
import { stepOf, deskCall } from '../computer/computer-args'
import type { ComputerAgent } from '../../../computer/computer-agent'
import type { Rect } from '../../../computer/computer-geometry'
import { displayNumberOf } from '../../../computer/computer-screen'
import type { WalkthroughDesk } from '../../../walkthrough/walkthrough-desk'
import { closeUpOf, strokeText } from '../../../walkthrough/walkthrough-marks'

/** Сколько последних пометок показать модели: больше - снимки крупным планом съедят контекст. */
const MARKS_MAX = 4

const NOTHING =
  'The user has not drawn anything on the screen. They draw with the pens on the walkthrough panel at the right edge of the screen.'

/** Область, прижатая к дисплею: крупный план у края не уходит за экран. */
const insideOf = (box: MarkBox, display: Rect): [MarkPoint, MarkPoint] => {
  const clampX = (x: number) => Math.min(Math.max(x, display.x), display.x + display.width - 1)
  const clampY = (y: number) => Math.min(Math.max(y, display.y), display.y + display.height - 1)

  return [
    { x: clampX(box.x), y: clampY(box.y) },
    { x: clampX(box.x + box.width), y: clampY(box.y + box.height) },
  ]
}

/**
 * Ответ инструмента user_marks (ADR 0135): свежий снимок дисплея с пометками человека (он же -
 * последний снимок разговора, по нему модель подсвечивает и действует дальше), каждая пометка
 * словами в пикселях этого снимка и крупный план того, на что она показывает. Пометок модель на
 * снимке не видит: окно меток закрыто от захвата, - поэтому крупный план, а не рисунок поверх.
 */
export const userMarksOutput = async (
  api: { desk: WalkthroughDesk; computer: ComputerAgent },
  call: NativeCall,
  conversationId: string,
): Promise<ToolOutput> => {
  const marks = api.desk.userMarks(conversationId)

  if (!marks) return new ToolOutput({ content: [{ type: 'text', text: NOTHING }] })

  const shot = await api.computer.screenshot(
    deskCall(call, stepOf({}, 'screenshot')),
    displayNumberOf(marks.display.id),
    0,
  )
  const strokes = marks.strokes.slice(-MARKS_MAX)
  const content: ToolOutput['result']['content'] = [
    { type: 'image', data: shot.picture.data, mimeType: shot.picture.mimeType },
  ]
  const lines: string[] = []

  for (const [index, stroke] of strokes.entries()) {
    const pixels = api.computer.pixelsOf(conversationId, stroke.points)
    const corners = api.computer.pixelsOf(
      conversationId,
      insideOf(closeUpOf(stroke.pen, stroke.points), marks.display.bounds),
    )

    if (!pixels || !corners) continue

    const [from, to] = corners

    lines.push(`${index + 1}) The user ${strokeText(stroke.pen, pixels)}.`)

    if (!from || !to) continue

    const closeUp = await api.computer.zoom(deskCall(call, stepOf({}, 'zoom')), [
      from.x,
      from.y,
      to.x,
      to.y,
    ])

    content.push(
      { type: 'text', text: `Close-up of mark ${index + 1}:` },
      { type: 'image', data: closeUp.data, mimeType: closeUp.mimeType },
    )
  }

  content.splice(1, 0, {
    type: 'text',
    text: [
      `Marks the user drew, oldest first, in pixels of this screenshot: ${lines.join(' ') || 'none on this display.'}`,
      'The marks are not on the screenshot: they are drawn over the screen where you cannot see them.',
      shot.text,
    ].join(' '),
  })

  return new ToolOutput({ content })
}
