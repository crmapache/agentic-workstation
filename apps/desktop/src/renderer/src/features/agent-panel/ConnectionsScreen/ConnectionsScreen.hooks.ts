import { useState } from 'react'

import type { ModelConnection } from '@shared/open-models'

import { useConnectionActions } from '../connections.queries'
import type { ConnectionDraft } from './ConnectionsScreen.types'
import { draftOf } from './ConnectionsScreen.utils'

/**
 * Состояние экрана подключений: что правится в диалоге, что спрашивают убрать, идёт ли
 * действие. Проба после правки идёт в главном процессе, экран ждёт только сохранения.
 */
export const useConnectionsScreen = () => {
  const actions = useConnectionActions()
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState<ConnectionDraft | null>(null)
  const [removing, setRemoving] = useState<ModelConnection | null>(null)
  const [failed, setFailed] = useState(false)

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true)
    await action()
    setBusy(false)
  }

  /** Сохранить черновик; не вышло - диалог остаётся с тем, что набрано, и словами сбоя. */
  const save = async (next: ConnectionDraft, key: string | null | undefined) => {
    const input = {
      label: next.label,
      ...(next.kind !== 'openrouter' && { baseUrl: next.baseUrl }),
      ...(key !== undefined && { key }),
    }

    setBusy(true)
    setFailed(false)

    const saved =
      next.id === null
        ? await actions.add({ ...input, kind: next.kind })
        : await actions.update(next.id, input)

    setBusy(false)
    if (saved) setDraft(null)
    else setFailed(true)
  }

  const openDraft = (next: ConnectionDraft | null) => {
    setFailed(false)
    setDraft(next)
  }

  const confirmRemove = () => {
    const connection = removing

    setRemoving(null)
    if (connection) void run(() => actions.remove(connection.id))
  }

  return {
    busy,
    draft,
    removing,
    failed,
    refresh: () => void run(actions.refresh),
    addOpenRouter: () => openDraft(draftOf(null, 'openrouter')),
    addCustom: () => openDraft(draftOf(null, 'custom')),
    edit: (connection: ModelConnection) => openDraft(draftOf(connection)),
    askRemove: setRemoving,
    closeDraft: () => openDraft(null),
    closeRemove: () => setRemoving(null),
    save: (next: ConnectionDraft, key: string | null | undefined) => void save(next, key),
    confirmRemove,
  }
}
