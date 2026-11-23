import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import type { Conversation } from '@shared/conversation'
import type { CommandEntry } from '@shared/slash-catalog'
import { withBuiltins, buildCommands, BUILTIN_ARGUMENTS } from '@shared/slash-catalog'
import type { Project } from '@shared/workspace'
import { useQuery } from '@tanstack/react-query'

import { invoke } from '../../lib/ipc'
import { QUERY_KEYS } from '../../state/query-keys'
import { usePickableModels } from './models.hooks'
import { usePanelCommands } from './panel-commands.hooks'
import {
  useEffortLevels,
  useSlashCommands,
  useBuiltinCommands,
  usePanelCapabilities,
} from './panel.queries'
import { DISK_COMMANDS_REFRESH_MS } from './slash-catalog.constants'
import {
  LOCAL_BUILTINS,
  PANEL_COMMANDS,
  PANEL_ARGUMENTS,
  BUILTIN_COMMANDS,
  DEFAULT_ARGUMENT,
} from './slash.constants'
import type { CommandOption } from './slash.types'

/**
 * Каталог «/» для поля: команды панели (только те, что умеют что-то в IDE), встроенные
 * с пояснениями, команды от CLI (свои - и до первого хода) и команды с диска. Диск
 * перечитывается, пока поле в фокусе: новый скилл виден за пару секунд и до первого
 * сообщения.
 */
export const useCommandCatalog = (
  project: Project,
  conversation: Conversation | null,
  isActive: boolean,
) => {
  const { t } = useTranslation()
  const panelActions = usePanelCommands(conversation)
  const projectCommands = useSlashCommands(project.rootPath)
  const builtins = useBuiltinCommands()
  const cli = useMemo(() => withBuiltins(projectCommands, builtins), [projectCommands, builtins])
  const capabilities = usePanelCapabilities()
  const disk = useQuery({
    queryKey: QUERY_KEYS.claudeCommands(project.id),
    queryFn: () => invoke('claude:listCommands', { projectId: project.id }),
    staleTime: DISK_COMMANDS_REFRESH_MS,
    refetchInterval: isActive ? DISK_COMMANDS_REFRESH_MS : false,
    enabled: capabilities.diskCommands,
  })
  // Тот же список, что у меню MODEL: запасные модели - только у Claude.
  const models = usePickableModels()
  const efforts = useEffortLevels(conversation?.model ?? null)
  const panelIds = Object.keys(panelActions).join(' ')

  const argumentSets = useMemo((): Record<string, CommandOption[]> => {
    return {
      model: [
        { id: DEFAULT_ARGUMENT, hint: t('agentPanel.model.defaultHint') },
        ...models.map((model) => ({
          id: model.value,
          hint: model.custom
            ? t('agentPanel.slash.customModel')
            : model.description || model.displayName,
        })),
      ],
      effort: [
        { id: DEFAULT_ARGUMENT, hint: t('agentPanel.effort.defaultHint') },
        // Как было у /effort всегда: от меньшего к большему (меню MODEL - наоборот).
        ...efforts.toReversed().map((level) => ({
          id: level,
          hint: t(`agentPanel.effort.hints.${level}`),
        })),
      ],
      // /fast on|off - значения второго шага; голая /fast переключает. Без быстрого режима у
      // провайдера значений нет: иначе «/fast on» тихо съедала бы панель.
      ...(capabilities.fastMode && {
        fast: [
          { id: 'on', hint: t('agentPanel.fast.argumentOn') },
          { id: 'off', hint: t('agentPanel.fast.argumentOff') },
        ],
      }),
    }
  }, [models, efforts, capabilities.fastMode, t])

  const commands = useMemo(() => {
    const panel = PANEL_COMMANDS.filter((id) => panelIds.split(' ').includes(id)).map(
      (id): CommandEntry => ({
        id,
        hint: t(`agentPanel.slash.panel.${id}`),
        argumentHint: PANEL_ARGUMENTS[id],
        group: 'panel',
      }),
    )
    const builtin = BUILTIN_COMMANDS.filter(
      (id) => LOCAL_BUILTINS.has(id) || capabilities.commands.includes(id),
    ).map((id): CommandEntry => ({
      id,
      hint: t(`agentPanel.slash.builtin.${id}`),
      argumentHint: BUILTIN_ARGUMENTS[id],
      group: 'built-in',
    }))

    return buildCommands(panel, builtin, cli, capabilities.diskCommands ? (disk.data ?? []) : [])
  }, [panelIds, cli, disk.data, capabilities.commands, capabilities.diskCommands, t])

  return { commands, argumentSets, panelActions }
}
