import { useRef, useEffect, useEffectEvent } from 'react'

import type { TerminalSession } from '@shared/terminal'

import { useTerminalActions } from '../terminal.queries'
import { useTerminalStore } from '../terminal.store'

/**
 * Поведение окна инструмента, как у Terminal в WebStorm: открытый терминал проекта без
 * вкладок сам заводит первую, закрытая вкладка отдаёт клавиатуру соседней, а закрытая
 * последняя прячет терминал. Оболочка не запустилась - сама больше не пробует, до «+».
 */
export const useTerminalLifecycle = (
  projectId: string | null,
  sessions: readonly TerminalSession[],
  isOpen: boolean,
  onHide: () => void,
) => {
  const { open } = useTerminalActions()
  const pick = useTerminalStore((store) => store.pick)
  const setFailed = useTerminalStore((store) => store.setFailed)
  const requestFocus = useTerminalStore((store) => store.requestFocus)
  const failed = useTerminalStore((store) => (projectId ? store.failed[projectId] : false))
  /** Сколько вкладок было у проекта в прошлый раз: «было и не стало» отличает от «не было». */
  const counts = useRef(new Map<string, number>())
  const starting = useRef(new Set<string>())

  const add = async (target: string) => {
    starting.current.add(target)

    try {
      const created = await open(target)

      setFailed(target, created === null)
      if (!created) return

      pick(target, created)
      requestFocus()
    } catch (error) {
      console.warn('[terminal] новая вкладка не открылась:', error)
      setFailed(target, true)
    } finally {
      starting.current.delete(target)
    }
  }

  const sync = useEffectEvent(() => {
    if (!projectId) return

    const before = counts.current.get(projectId) ?? 0

    counts.current.set(projectId, sessions.length)

    if (!isOpen) return
    // Вкладка закрылась, соседние остались - клавиатура в выбранную, как в WebStorm.
    if (sessions.length > 0) return before > sessions.length ? requestFocus() : undefined
    if (before > 0) return onHide()
    if (!failed && !starting.current.has(projectId)) void add(projectId)
  })

  useEffect(() => {
    sync()
  }, [projectId, sessions.length, isOpen])

  return { add: () => projectId && void add(projectId), failed: Boolean(failed) }
}
