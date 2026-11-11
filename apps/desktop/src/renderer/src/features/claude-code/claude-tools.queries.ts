import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { ToolsResult } from '@shared/claude-tools'
import { useQuery, useMutation } from '@tanstack/react-query'

import { invoke } from '../../lib/ipc'
import { QUERY_KEYS } from '../../state/query-keys'
import type { ToolsAction, ScreenNoticeValue } from './claude.types'
import { toolsFailureText } from './claude.utils'

/** Плагины проекта, каталог маркетплейсов и сами маркетплейсы - каждый раз заново. */
export const usePluginCatalog = (projectId: string) =>
  useQuery({
    queryKey: QUERY_KEYS.pluginCatalog(projectId),
    queryFn: () => invoke('plugins:catalog', { projectId }),
    staleTime: 0,
  })

/**
 * Действие экрана инструментов (плагины, /config): запустить, показать итог плашкой -
 * успех своими словами или отчётом CLI, отказ причиной и текстом CLI, - и положить
 * список, пришедший вместе с итогом, в кэш. Занятость - у мутации: над каким
 * элементом она сейчас идёт.
 */
export const useToolsAction = <Input, Outcome extends { result: ToolsResult }>({
  run,
  describe,
  apply,
}: ToolsAction<Input, Outcome>) => {
  const { t } = useTranslation()
  const [notice, setNotice] = useState<ScreenNoticeValue>(null)
  const mutation = useMutation({
    mutationFn: run,
    onSuccess: (outcome, input) => {
      const { result } = outcome

      apply(outcome)
      setNotice(
        result.ok
          ? { tone: 'info', text: result.detail || describe(input).success }
          : {
              tone: 'danger',
              text: toolsFailureText(t, result.failure ?? 'failed', result.detail),
            },
      )
    },
    onError: (error) => {
      console.warn('[claude-code] действие с инструментами не выполнено:', error)
      setNotice({ tone: 'danger', text: toolsFailureText(t, 'failed', '') })
    },
  })

  return {
    /** Запустить; итог - тому, кто звал (вход в браузере, согласие), null - сбой связи. */
    start: (input: Input) =>
      mutation
        .mutateAsync(input)
        .then((outcome) => outcome.result)
        .catch(() => null),
    busy: mutation.isPending && mutation.variables ? describe(mutation.variables).target : null,
    notice,
    setNotice,
  }
}
