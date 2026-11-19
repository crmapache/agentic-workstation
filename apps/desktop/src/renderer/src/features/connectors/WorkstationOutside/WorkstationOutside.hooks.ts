import { useRef, useState, useEffect } from 'react'

import type { OutsideCopy } from '@shared/connectors'

import { COPIED_FEEDBACK_MS } from '@agentic-workstation/ui/CodeSnippet.constants'

import { useConnectorActions } from '../../../state/connectors.queries'

/**
 * Настройка для чужого клиента - в буфер обмена: текст с ключом кладёт главный процесс, окно его
 * не видит. copied - что скопировано только что (галочка на пару мгновений), failed - ключ не
 * сохранить.
 */
export const useOutsideCopy = () => {
  const actions = useConnectorActions()
  const [copied, setCopied] = useState<OutsideCopy | null>(null)
  const [failed, setFailed] = useState(false)
  const timer = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
    },
    [],
  )

  const copy = async (what: OutsideCopy) => {
    const done = await actions.copyOutside(what)

    setFailed(!done)
    setCopied(done ? what : null)

    if (timer.current !== null) window.clearTimeout(timer.current)

    timer.current = window.setTimeout(() => setCopied(null), COPIED_FEEDBACK_MS)
  }

  return { copied, failed, copy }
}
