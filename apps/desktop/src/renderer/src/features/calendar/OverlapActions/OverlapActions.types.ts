export type OverlapActionsProps = {
  overlapKey: string
  /** Человек уже отметил накладку «видел». */
  seen: boolean
  /** Значками в строке списка; иначе - кнопками с подписью. */
  compact?: boolean | undefined
}
