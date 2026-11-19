import { Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { ExtensionsState } from '@shared/extensions'

import { Button } from '@agentic-workstation/ui/Button'
import { EmptyState } from '@agentic-workstation/ui/EmptyState'
import { Section } from '@agentic-workstation/ui/Section'

import { splitByApproval } from '../ExtensionsView.utils'
import { useExtensionsStore } from '../../extensions.store'
import { ExtensionTiles } from './ExtensionTiles'

/** Свои расширения: ждущие одобрения - сверху, остальные под ними; пусто - зов создать первое. */
export const InstalledPage = ({ state }: { state: ExtensionsState }) => {
  const { t } = useTranslation()
  const open = useExtensionsStore((store) => store.open)
  const { waiting, rest } = splitByApproval(state.extensions)

  if (state.extensions.length === 0) {
    return (
      <EmptyState
        icon={Sparkles}
        title={t('extensions.empty.title')}
        description={t('extensions.empty.description')}
        action={
          <Button variant="primary" size="sm" icon={Sparkles} onClick={() => open({ kind: 'new' })}>
            {t('extensions.newExtension')}
          </Button>
        }
      />
    )
  }

  return (
    <>
      {waiting.length > 0 && (
        <Section title={t('extensions.approvalTitle')} count={waiting.length}>
          <ExtensionTiles extensions={waiting} />
        </Section>
      )}
      {rest.length > 0 && (
        <Section title={t('extensions.listTitle')} count={rest.length}>
          <ExtensionTiles extensions={rest} />
        </Section>
      )}
    </>
  )
}
