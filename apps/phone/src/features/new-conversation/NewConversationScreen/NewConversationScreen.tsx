import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { CommandArgs } from '@agentic-workstation/remote-protocol/commands'
import { Button } from '@agentic-workstation/ui/Button'
import { Section } from '@agentic-workstation/ui/Section'
import { Spinner } from '@agentic-workstation/ui/Spinner'

import { modeOptions, modelOptions, effortOptions } from '../../../lib/options.utils'
import type { RouteOf } from '../../../lib/route.types'
import { useRouter } from '../../../lib/router.store'
import { useCommand } from '../../../state/commands.hooks'
import { useInventory } from '../../../state/remote.queries'
import { OptionList } from '../../../shell/OptionList/OptionList'
import { Screen } from '../../../shell/Screen/Screen'
import styles from './NewConversationScreen.module.scss'

type NewArgs = CommandArgs<'conversation.new'>

/**
 * Новый разговор в открытом проекте: провайдер, модель, усилие и режим - только те, что можно
 * с телефона (без bypass и auto). Первое сообщение пишется уже в самом разговоре.
 */
export const NewConversationScreen = ({ route }: { route: RouteOf<'newConversation'> }) => {
  const { t } = useTranslation()
  const { agentId, projectKey } = route
  const navigate = useRouter((state) => state.navigate)
  const inventory = useInventory(agentId).data
  const project = inventory?.projects.find((one) => one.key === projectKey)
  const providers = inventory?.providers.filter((one) => one.available) ?? []
  const [providerId, setProviderId] = useState('')
  const [model, setModel] = useState('')
  const [effort, setEffort] = useState('')
  const [mode, setMode] = useState('default')
  const create = useCommand(agentId, 'conversation.new')
  const provider = providers.find((one) => one.id === providerId) ?? providers[0]

  const handleCreate = async () => {
    if (!provider) return

    const data = (await create
      .mutateAsync({
        projectKey,
        provider: provider.id,
        ...(model && { model }),
        ...(effort && { effort: effort as NonNullable<NewArgs['effort']> }),
        permissionMode: mode as NonNullable<NewArgs['permissionMode']>,
      })
      .catch(() => null)) as { conversationId?: string } | null

    if (data?.conversationId) {
      navigate(
        { name: 'conversation', agentId, projectKey, conversationId: data.conversationId },
        { replace: true },
      )
    }
  }

  return (
    <Screen
      title={t('newConversation.title')}
      subtitle={project?.name}
      help={{ title: t('newConversation.help.title'), text: t('newConversation.help.text') }}
      footer={
        <Button
          size="touch"
          variant="primary"
          disabled={!provider || !project?.open || create.isPending}
          onClick={() => void handleCreate()}>
          {t('newConversation.create')}
        </Button>
      }>
      {!inventory && <Spinner size="md" label={t('project.loading')} />}
      {inventory && !provider && <p className={styles.note}>{t('newConversation.noProvider')}</p>}
      {provider && (
        <>
          {providers.length > 1 && (
            <Section size="sm" title={t('newConversation.provider')}>
              <OptionList
                label={t('newConversation.provider')}
                options={providers.map((one) => ({ value: one.id, label: one.label }))}
                isSelected={(value) => value === provider.id}
                onSelect={setProviderId}
              />
            </Section>
          )}
          <Section size="sm" title={t('conversation.settings.model')}>
            <OptionList
              label={t('conversation.settings.model')}
              options={modelOptions(t, provider)}
              isSelected={(value) => value === model}
              onSelect={setModel}
            />
          </Section>
          <Section size="sm" title={t('conversation.settings.effort')}>
            <OptionList
              label={t('conversation.settings.effort')}
              options={effortOptions(t, provider)}
              isSelected={(value) => value === effort}
              onSelect={setEffort}
            />
          </Section>
          <Section size="sm" title={t('newConversation.mode')}>
            <OptionList
              label={t('newConversation.mode')}
              options={modeOptions(t, provider)}
              isSelected={(value) => value === mode}
              onSelect={setMode}
            />
          </Section>
        </>
      )}
    </Screen>
  )
}
