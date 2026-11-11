import { useRef, useState, useEffect, useCallback } from 'react'

/**
 * Значение, которое на экране меняется сразу, а записывается, когда человек перестал
 * его трогать (ползунок, кнопки размера). Пока запись не дошла, экран показывает своё,
 * а не эхо главного процесса - иначе ответ на первое из трёх быстрых нажатий откатил
 * бы цифру. Уход с экрана посреди паузы дописывает последнее, а не теряет его.
 */
export const useDelayedSave = <T>(
  saved: T,
  save: (value: T) => Promise<unknown>,
  delayMs: number,
): readonly [T, (value: T) => void] => {
  const [draft, setDraft] = useState<{ value: T } | null>(null)
  const pending = useRef<{ value: T } | null>(null)
  const timer = useRef<number | null>(null)
  const latestSave = useRef(save)

  useEffect(() => {
    latestSave.current = save
  })

  const flush = useCallback(() => {
    const next = pending.current

    if (timer.current !== null) window.clearTimeout(timer.current)

    timer.current = null
    pending.current = null

    if (!next) return

    void latestSave.current(next.value).finally(() => {
      // Новое значение уже ждёт своей записи - экран держит его, а не ответ на старое.
      if (!pending.current) setDraft(null)
    })
  }, [])

  useEffect(() => flush, [flush])

  const change = (value: T) => {
    pending.current = { value }
    setDraft({ value })

    if (timer.current !== null) window.clearTimeout(timer.current)

    timer.current = window.setTimeout(flush, delayMs)
  }

  return [draft ? draft.value : saved, change] as const
}
