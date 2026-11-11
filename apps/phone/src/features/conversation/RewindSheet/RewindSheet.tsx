import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Modal } from '@agentic-workstation/ui/Modal'
import { Section } from '@agentic-workstation/ui/Section'

import { OptionList } from '../../../shell/OptionList/OptionList'
import { useRewindSheet } from './RewindSheet.hooks'
import styles from './RewindSheet.module.scss'
import type { RewindSheetProps } from './RewindSheet.types'
import { RewindPreview } from './parts/RewindPreview'

/**
 * Откат разговора к сообщению: что уходит (разговор, код или оба), какие файлы вернутся, и
 * красная кнопка. Окно и есть «точно?»: человек видит последствия, прежде чем нажать.
 */
export const RewindSheet = (props: RewindSheetProps) => {
  const { t } = useTranslation()
  const sheet = useRewindSheet(props)
  const { preview } = sheet

  return (
    <Modal
      open
      title={t('rewind.title')}
      description={t('rewind.lead')}
      closeLabel={t('common.close')}
      closeSize="touch"
      onClose={props.onClose}
      footer={
        <Button
          size="touch"
          variant="danger"
          disabled={sheet.isRewinding || preview.isPending}
          onClick={() => void sheet.handleRewind()}>
          {t('rewind.go')}
        </Button>
      }>
      <div className={styles.sheet}>
        <Section size="sm" title={t('rewind.what')}>
          <OptionList
            label={t('rewind.what')}
            options={sheet.scopes.map((scope) => ({
              value: scope,
              label: t(`rewind.scopes.${scope}`),
            }))}
            isSelected={(value) => value === sheet.scope}
            disabled={sheet.isRewinding}
            onSelect={sheet.setScope}
          />
        </Section>
        <RewindPreview preview={preview.data} isPending={preview.isPending} error={preview.error} />
        {props.running && <p className={styles.note}>{t('rewind.running')}</p>}
        {props.queued > 0 && (
          <p className={styles.note}>{t('rewind.queued', { count: props.queued })}</p>
        )}
      </div>
    </Modal>
  )
}
