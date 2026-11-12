import { useState, useEffect, useEffectEvent } from 'react'
import type { KeyboardEvent } from 'react'

import type { HttpConnectorSpec, GenerateConnectorRequest } from '@shared/connector-spec'
import type { Connector, ImportOutcome, AddConnectorError } from '@shared/connectors'

import { useImportCandidates } from '../connectors.queries'
import { useConnectorActions } from '../../../state/connectors.queries'
import { EMPTY_ADD_FIELDS, EMPTY_AI_REQUEST, DESCRIPTION_SAVE_MS } from './ConnectorsView.constants'
import type { FormKind, AddFormState, AddFormFields, TypeNameValues } from './ConnectorsView.types'
import { addRequest, defaultImportChoice } from './ConnectorsView.utils'

/**
 * Форма нового коннектора: поля (initial - заполненные заранее), отправка и причина отказа.
 * Удалось - onAdded с id нового: лист показывает его (вход в браузере идёт сам). Повторное
 * нажатие, пока главный процесс отвечает, ничего не делает.
 */
export const useAddConnectorForm = (
  kind: FormKind,
  onAdded: (id: string | null) => void,
  initial: Partial<AddFormFields> = {},
): AddFormState => {
  const actions = useConnectorActions()
  const [fields, setFields] = useState<AddFormFields>(() => ({ ...EMPTY_ADD_FIELDS, ...initial }))
  const [error, setError] = useState<AddConnectorError | null>(null)
  const [isBusy, setIsBusy] = useState(false)

  const patch = (change: Partial<AddFormFields>) => {
    setFields((previous) => ({ ...previous, ...change }))
    setError(null)
  }

  const set: AddFormState['set'] = (key) => (value) => patch({ [key]: value })

  const submit = async () => {
    if (isBusy) return

    setIsBusy(true)

    try {
      const outcome = await actions.add(addRequest(kind, fields))

      if (outcome.error) setError(outcome.error)
      else onAdded(outcome.id)
    } catch {
      // Главный процесс отказал исключением - поле не прошло проверку на границе.
      setError('failed')
    } finally {
      setIsBusy(false)
    }
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return

    event.preventDefault()
    void submit()
  }

  return { fields, set, patch, error, isBusy, submit, handleKeyDown }
}

/**
 * Просьба к ИИ (сервис, что делать, документация): уходит в очередь работ на виде, и форма
 * закрывается - работа идёт в главном процессе сама (ADR 0050). Enter в однострочном поле
 * отправляет просьбу.
 */
export const useAiConnector = (onStarted: () => void) => {
  const actions = useConnectorActions()
  const [request, setRequest] = useState<GenerateConnectorRequest>(EMPTY_AI_REQUEST)

  const setField = (key: keyof GenerateConnectorRequest) => (value: string) =>
    setRequest((previous) => ({ ...previous, [key]: value }))

  const start = () => {
    if (!request.service.trim()) return

    actions.startAiJob(request)
    onStarted()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return

    event.preventDefault()
    start()
  }

  return { request, setField, start, handleKeyDown }
}

/**
 * Готовое описание от ИИ: подпись, ключ и добавить. Ключ вводится только здесь - ИИ,
 * который писал описание, его не видит. Enter в поле добавляет коннектор.
 */
export const useAiSpecAdd = (spec: HttpConnectorSpec, onAdded: (id: string | null) => void) => {
  const actions = useConnectorActions()
  const [type, setType] = useState<TypeNameValues>({
    name: spec.service,
    multiple: false,
    label: '',
  })
  const [secret, setSecret] = useState('')
  const [username, setUsername] = useState('')
  const [error, setError] = useState<AddConnectorError | null>(null)
  const [isBusy, setIsBusy] = useState(false)

  const add = async () => {
    if (isBusy) return

    setIsBusy(true)

    try {
      const outcome = await actions.add({ kind: 'http', ...type, spec, secret, username })

      if (outcome.error) setError(outcome.error)
      else onAdded(outcome.id)
    } catch {
      setError('failed')
    } finally {
      setIsBusy(false)
    }
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return

    event.preventDefault()
    void add()
  }

  return {
    type,
    setType: (patch: Partial<TypeNameValues>) => {
      setType((previous) => ({ ...previous, ...patch }))
      setError(null)
    },
    secret,
    setSecret,
    username,
    setUsername,
    error,
    isBusy,
    add: () => void add(),
    handleKeyDown,
  }
}

/**
 * Ещё одно подключение своего типа (ADR 0034): подпись и вход этого подключения - ключ
 * своего MCP или коннектора от ИИ, логин Basic. Удалось - onAdded с id нового. Enter в поле
 * добавляет.
 */
export const useAddToTypeForm = (typeId: string, onAdded: (id: string | null) => void) => {
  const actions = useConnectorActions()
  const [fields, setFields] = useState({ label: '', token: '', secret: '', username: '' })
  const [error, setError] = useState<AddConnectorError | null>(null)
  const [isBusy, setIsBusy] = useState(false)

  const set = (key: keyof typeof fields) => (value: string) => {
    setFields((previous) => ({ ...previous, [key]: value }))
    setError(null)
  }

  const submit = async () => {
    if (isBusy) return

    setIsBusy(true)

    try {
      const outcome = await actions.addToType({ typeId, ...fields })

      if (outcome.error) setError(outcome.error)
      else onAdded(outcome.id)
    } catch {
      setError('failed')
    } finally {
      setIsBusy(false)
    }
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return

    event.preventDefault()
    void submit()
  }

  return { fields, set, error, isBusy, submit: () => void submit(), handleKeyDown }
}

/**
 * Перенос MCP-серверов из Claude Code: список читается при открытии, выбор по умолчанию -
 * всё, что можно взять, кроме серверов .mcp.json (их принёс репозиторий). Итог - сколько
 * перенесено и что пропущено.
 */
export const useImportPanel = () => {
  const actions = useConnectorActions()
  const { data: candidates, isFetching } = useImportCandidates()
  const [picked, setPicked] = useState<ReadonlySet<string> | null>(null)
  const [result, setResult] = useState<Omit<ImportOutcome, 'state'> | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const chosen = picked ?? defaultImportChoice(candidates ?? [])

  const toggle = (key: string, on: boolean) => {
    const next = new Set(chosen)

    if (on) next.add(key)
    else next.delete(key)

    setPicked(next)
  }

  const submit = async () => {
    setIsImporting(true)

    const outcome = await actions.importServers([...chosen]).catch(() => null)

    setResult(outcome ? { imported: outcome.imported, skipped: outcome.skipped } : null)
    setIsImporting(false)
  }

  return {
    candidates: candidates ?? null,
    chosen,
    result,
    isBusy: isFetching || isImporting,
    toggle,
    submit: () => void submit(),
  }
}

/**
 * Черновик описания коннектора. Набранное уходит в главный процесс через секунду тишины и
 * сразу - при уходе из поля (flush) и при закрытии окна: каждое сохранение переподключает
 * сервер у живых разговоров, поэтому не на каждую букву. Пробелы по краям не в счёт - их
 * срезает главный процесс.
 */
export const useDescriptionDraft = ({ id, description }: Connector) => {
  const actions = useConnectorActions()
  const [draft, setDraft] = useState(description)

  const flush = () => {
    if (draft.trim() !== description) void actions.setDescription(id, draft)
  }

  const flushNow = useEffectEvent(flush)

  useEffect(() => {
    const timer = setTimeout(() => flushNow(), DESCRIPTION_SAVE_MS)

    return () => clearTimeout(timer)
  }, [draft])

  // Окно закрыли посреди набора - набранное не теряется.
  useEffect(() => () => flushNow(), [])

  return { draft, setDraft, flush }
}
