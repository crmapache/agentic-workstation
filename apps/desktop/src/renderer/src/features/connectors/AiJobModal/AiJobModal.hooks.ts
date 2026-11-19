import { useState } from 'react'
import type { KeyboardEvent } from 'react'

import type { AiJob, AiProposal } from '@shared/connector-spec'
import type { ImportSkipReason } from '@shared/connectors'

import { useImportCandidates } from '../connectors.queries'
import { useConnectorsStore } from '../connectors.store'
import { useIpcEvent } from '../../../lib/ipc.hooks'
import { useConnectorActions } from '../../../state/connectors.queries'

/**
 * Коннектор из работы добавлен: работа больше не нужна и уходит из очереди, окно показывает
 * новый коннектор (там идёт вход). Добавлено несколько или ничего (id нет) - окно закрывается.
 */
export const useJobAdded = (jobId: string) => {
  const actions = useConnectorActions()
  const openConnector = useConnectorsStore((store) => store.openConnector)
  const close = useConnectorsStore((store) => store.close)

  return (id: string | null) => {
    actions.removeAiJob(jobId)

    if (id) openConnector(id)
    else close()
  }
}

/**
 * Готовое от ИИ IDE добавила сама (ADR 0086): окно этой работы, если оно открыто, показывает
 * новый коннектор - там его вход и проекты. Подписка - у окон вида, а не у окна работы: работа
 * уходит из состояния раньше, чем приходит это событие.
 */
export const useJobAdoption = () => {
  const openConnector = useConnectorsStore((store) => store.openConnector)

  useIpcEvent('connectors:aiJobAdded', ({ jobId, connectorId }) => {
    const { panel } = useConnectorsStore.getState()

    if (panel?.kind === 'aiJob' && panel.id === jobId) openConnector(connectorId)
  })
}

/**
 * Поле ИИ внизу окна: Enter отправляет, Shift+Enter - новая строка, как в панели Claude Code.
 * Писать можно и посреди хода - ИИ подхватит слова между шагами.
 */
export const useTell = (job: AiJob) => {
  const actions = useConnectorActions()
  const [text, setText] = useState('')
  const canSend = text.trim().length > 0

  const send = () => {
    if (!canSend) return

    actions.tellAiJob(job.id, text.trim())
    setText('')
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return

    event.preventDefault()
    send()
  }

  return { text, setText, canSend, send, handleKeyDown }
}

/**
 * Перенос сервера из Claude Code, который назвал ИИ. Конфиг перечитывается на каждое открытие:
 * сервер могли уже перенести или поменять в терминале - тогда видно свежее. Перенесённый
 * находится по имени сервера: так его называет и перенос.
 */
export const useExistingAdd = (
  proposal: Extract<AiProposal, { kind: 'existing' }>,
  onAdded: (id: string | null) => void,
) => {
  const actions = useConnectorActions()
  const { data, isLoading } = useImportCandidates()
  const [skipped, setSkipped] = useState<ImportSkipReason | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const fresh = data?.find((item) => item.key === proposal.candidate.key)
  const candidate = fresh ?? proposal.candidate
  // Сервер пропал из конфига - переносить нечего.
  const isGone = !isLoading && !fresh

  const add = async () => {
    if (isBusy || !fresh) return

    setIsBusy(true)

    try {
      const outcome = await actions.importServers([fresh.key])
      const added = outcome.state.connectors.find((item) => item.serverName === fresh.serverName)

      if (outcome.imported > 0) onAdded(added?.id ?? null)
      else setSkipped(outcome.skipped[0]?.reason ?? 'failed')
    } catch {
      setSkipped('failed')
    } finally {
      setIsBusy(false)
    }
  }

  return { candidate, isGone, skipped, isBusy: isBusy || isLoading, add: () => void add() }
}
