import { useTranslation } from 'react-i18next'

import { CONNECTOR_INSTRUCTIONS_MAX } from '@shared/connectors'

import { TextArea } from '@agentic-workstation/ui/TextArea'

import { useInProjectDraft } from '../ConnectorsView.hooks'
import type { InProjectFieldsProps } from '../ConnectorsView.types'
import { BrowserProfilePicker } from './BrowserProfilePicker'

/**
 * Что сказано коннектору в одном проекте: у Browser профиль Chrome проекта, у всех - инструкции
 * модели. Сохраняется само; другой проект - новые поля (ключ по пути), набранное не переезжает.
 */
export const InProjectFields = ({ connector, projectPath, browser }: InProjectFieldsProps) => {
  const { t } = useTranslation()
  const { draft, setDraft, flush, profile, pickProfile } = useInProjectDraft(connector, projectPath)
  const isBrowser = connector.kind === 'browser'

  return (
    <>
      {isBrowser && (
        <BrowserProfilePicker
          value={profile}
          profiles={browser.profiles}
          chromeProfiles={browser.chromeProfiles}
          onPick={pickProfile}
        />
      )}
      <TextArea
        label={t('connectors.inProject.instructions')}
        placeholder={
          isBrowser
            ? t('connectors.inProject.placeholderBrowser')
            : t('connectors.inProject.placeholder')
        }
        value={draft}
        maxLength={CONNECTOR_INSTRUCTIONS_MAX}
        resizable
        onChange={setDraft}
        onBlur={flush}
      />
    </>
  )
}
