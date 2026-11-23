import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import type { CommandArgs } from '@agentic-workstation/remote-protocol/commands'
import type {
  ProviderCaps,
  ConversationWire,
} from '@agentic-workstation/remote-protocol/wire-types'

import type { OutgoingMessage } from '../../lib/attachments'
import { localCommand } from '../../lib/slash.utils'
import { useCommand } from '../../state/commands.hooks'
import { useDraftsStore } from '../../state/drafts.store'
import { useSlashCommands } from '../../state/remote.queries'
import type { ComposerSlash } from '../../shell/Composer/Composer.types'
import { slashCatalog, phoneCommands, DEFAULT_ARGUMENT } from './slash.utils'
import { useAskAside } from './AsideSheet/AsideSheet.hooks'

type Effort = CommandArgs<'conversation.setEffort'>['effort']

/**
 * Подсказка «/» поля разговора и команды, которые выполняет сам телефон. Каталог IDE (команды и
 * скиллы CLI, проекта и с диска) спрашивается, когда в поле начали набирать команду. Свои
 * команды - как команды панели у поля окна: /btw спрашивает сбоку и открывает окно вопросов,
 * /fast переключает быстрый режим, /model и /effort со знакомым значением меняют выбор
 * разговора, а без него открывают настройки разговора. Остальное уходит CLI текстом.
 */
export const useConversationSlash = ({
  agentId,
  draftKey,
  conversation,
  provider,
  onOpenAside,
  onOpenSettings,
}: {
  agentId: string
  draftKey: string
  conversation: ConversationWire | null | undefined
  provider: ProviderCaps | undefined
  onOpenAside: () => void
  onOpenSettings: () => void
}) => {
  const { t } = useTranslation()
  const conversationId = conversation?.id ?? ''
  const typing = useDraftsStore((state) => (state.drafts[draftKey] ?? '').startsWith('/'))
  const ide = useSlashCommands(agentId, conversationId, typing && conversationId !== '').data
  const setModel = useCommand(agentId, 'conversation.setModel')
  const setEffort = useCommand(agentId, 'conversation.setEffort')
  const setFast = useCommand(agentId, 'conversation.setFast')
  const aside = useAskAside(agentId, conversationId)
  const phone = useMemo(() => phoneCommands(t, conversation, provider), [t, conversation, provider])
  const agent = provider?.label ?? ''
  const slash = useMemo(
    (): ComposerSlash => ({
      commands: slashCatalog(t, phone.commands, ide?.commands ?? [], agent),
      argumentSets: phone.argumentSets,
    }),
    [t, phone, ide, agent],
  )

  /** Знакомое значение аргумента: «default» - как в настройках (null на проводе). */
  const known = (name: string, argument: string): string | null | undefined => {
    if (!phone.argumentSets[name]?.some((option) => option.value === argument)) return undefined

    return argument === DEFAULT_ARGUMENT ? null : argument
  }

  /**
   * Своя команда телефона - выполнена здесь (true: поле очищается); null - это не она, сообщение
   * уходит CLI. С фото и файлами своё не выполняется: они - сообщение модели.
   */
  const run = (message: OutgoingMessage): boolean | null => {
    const local =
      message.images.length === 0 && message.files.length === 0
        ? localCommand(message.text, new Set(phone.commands.map((command) => command.name)))
        : null

    if (!local) return null

    const { name, argument } = local
    const value = known(name, argument)

    if (name === 'btw') {
      // Модель ещё думает над прошлым вопросом - этот остаётся в поле, окно показывает тот.
      const asked = argument === '' || aside.ask(argument)

      onOpenAside()

      return asked
    }

    if (name === 'fast' && (argument === '' || value !== undefined)) {
      setFast.mutate({
        conversationId,
        fast: argument === '' ? !(conversation?.fast?.asked ?? false) : argument === 'on',
      })
    } else if (name === 'model' && value !== undefined) {
      setModel.mutate({ conversationId, model: value })
    } else if (name === 'effort' && value !== undefined) {
      setEffort.mutate({ conversationId, effort: value as Effort })
    } else {
      onOpenSettings()
    }

    return true
  }

  return { slash, run }
}
