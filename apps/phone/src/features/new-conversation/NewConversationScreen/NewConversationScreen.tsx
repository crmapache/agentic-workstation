import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { ProviderPreset } from '@agentic-workstation/remote-protocol/wire-types'
import { Button } from '@agentic-workstation/ui/Button'
import { Section } from '@agentic-workstation/ui/Section'

import { modelOptions, effortOptions, newModeOptions } from '../../../lib/options.utils'
import type { RouteOf } from '../../../lib/route.types'
import { navigateFromHere } from '../../../lib/router.store'
import { useCommand } from '../../../state/commands.hooks'
import { useInventory } from '../../../state/remote.queries'
import { LinkWait } from '../../../shell/LinkWait/LinkWait'
import { OptionList } from '../../../shell/OptionList/OptionList'
import { Screen } from '../../../shell/Screen/Screen'
import { AS_IN_IDE } from './NewConversationScreen.constants'
import styles from './NewConversationScreen.module.scss'
import type { NewChoice } from './NewConversationScreen.types'
import { withModel, presetChoice, newConversationArgs } from './NewConversationScreen.utils'
import { PresetChips } from './parts/PresetChips'

/**
 * Новый разговор в открытом проекте: провайдер, модель, усилие и режим - любой, в котором окно
 * IDE начало бы вкладку этого проекта (ADR 0076; погашенное у окна погашено и здесь). Модель,
 * усилие и режим - списками выбранного провайдера: другой провайдер начинает выбор заново, другая
 * модель снимает усилие, которого у неё нет. Сначала всё «как в IDE» - как у новой вкладки окна
 * этого провайдера (его Settings → New chats): выбирать заново каждый раз не нужно. Пресеты
 * провайдера (кнопки под полем окна, ADR 0096) ставят все три одним нажатием. Первое сообщение
 * пишется уже в самом разговоре.
 */
export const NewConversationScreen = ({ route }: { route: RouteOf<'newConversation'> }) => {
  const { t } = useTranslation()
  const { agentId, projectKey } = route
  const inventory = useInventory(agentId).data
  const project = inventory?.projects.find((one) => one.key === projectKey)
  const providers = inventory?.providers.filter((one) => one.available) ?? []
  const [providerId, setProviderId] = useState('')
  const [choice, setChoice] = useState<NewChoice>(AS_IN_IDE)
  const create = useCommand(agentId, 'conversation.new')
  const provider = providers.find((one) => one.id === providerId) ?? providers[0]
  const unavailableModes = provider && project?.unavailableModes?.[provider.id]

  const handleProvider = (id: string) => {
    if (id === provider?.id) return

    setProviderId(id)
    setChoice(AS_IN_IDE)
  }

  const handlePreset = (preset: ProviderPreset) => {
    if (provider) setChoice((now) => presetChoice(preset, now, provider, unavailableModes))
  }

  const handleModel = (model: string) => {
    if (provider) setChoice((now) => withModel(provider, now, model))
  }

  const handleEffort = (effort: string) => setChoice((now) => ({ ...now, effort }))

  const handleMode = (mode: string) => setChoice((now) => ({ ...now, mode }))

  const handleCreate = async () => {
    if (!provider) return

    const navigate = navigateFromHere()
    const data = (await create
      .mutateAsync(newConversationArgs(projectKey, provider.id, choice))
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
      agentId={agentId}
      footer={
        <Button
          size="touch"
          variant="primary"
          disabled={!provider || !project?.open || create.isPending}
          onClick={() => void handleCreate()}>
          {t('newConversation.create')}
        </Button>
      }>
      {!inventory && <LinkWait agentId={agentId} label={t('project.loading')} />}
      {inventory && !provider && <p className={styles.note}>{t('newConversation.noProvider')}</p>}
      {provider && (
        <>
          {providers.length > 1 && (
            <Section size="sm" title={t('newConversation.provider')}>
              <OptionList
                label={t('newConversation.provider')}
                options={providers.map((one) => ({ value: one.id, label: one.label }))}
                isSelected={(value) => value === provider.id}
                onSelect={handleProvider}
              />
            </Section>
          )}
          <PresetChips presets={provider.presets ?? []} choice={choice} onPick={handlePreset} />
          {/* «По умолчанию» пресета (null) - строкой «как в IDE», как у живого разговора. */}
          <Section size="sm" title={t('conversation.settings.model')}>
            <OptionList
              label={t('conversation.settings.model')}
              options={modelOptions(t, provider)}
              isSelected={(value) => value === (choice.model ?? '')}
              onSelect={handleModel}
            />
          </Section>
          <Section size="sm" title={t('conversation.settings.effort')}>
            <OptionList
              label={t('conversation.settings.effort')}
              options={effortOptions(t, provider, choice.model)}
              isSelected={(value) => value === (choice.effort ?? '')}
              onSelect={handleEffort}
            />
          </Section>
          <Section size="sm" title={t('newConversation.mode')}>
            <OptionList
              label={t('newConversation.mode')}
              options={newModeOptions(t, provider, unavailableModes)}
              isSelected={(value) => value === choice.mode}
              onSelect={handleMode}
            />
          </Section>
        </>
      )}
    </Screen>
  )
}
