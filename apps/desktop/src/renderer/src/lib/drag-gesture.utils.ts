/**
 * Шаг прокрутки за кадр, пока рука у края: чем ближе к краю, тем быстрее, минус - к началу.
 * Ось любая: для вертикали - y руки и верх с низом. Тому, кому листать некуда, - ноль.
 */
export const autoScrollStep = (
  pointerX: number,
  box: { left: number; right: number },
  room: { before: number; after: number },
  edge: number,
  maxStep: number,
): number => {
  const toLeft = pointerX - box.left
  const toRight = box.right - pointerX

  if (toLeft < edge && room.before > 0) {
    return -Math.min(room.before, Math.ceil(((edge - Math.max(toLeft, 0)) / edge) * maxStep))
  }

  if (toRight < edge && room.after > 0) {
    return Math.min(room.after, Math.ceil(((edge - Math.max(toRight, 0)) / edge) * maxStep))
  }

  return 0
}
