import { Mail, Plug, Plus, RotateCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@agentic-workstation/ui/Badge'
import { Button } from '@agentic-workstation/ui/Button'
import { HelpButton } from '@agentic-workstation/ui/HelpButton'
import { IconButton } from '@agentic-workstation/ui/IconButton'
import { PageHeader } from '@agentic-workstation/ui/PageHeader'
import { Section } from '@agentic-workstation/ui/Section'
import { Tile } from '@agentic-workstation/ui/Tile'

import styles from '../ComponentsView.module.scss'
import { Specimen } from '../../Specimen/Specimen'

/**
 * Образец вида целиком: шапка вида и раздел lg с «?» вместо абзаца пояснения, раздел sm
 * со строкой состояния, как внутри окна. Рамка образца - место середины окна.
 */
export const PageSpecimen = () => {
  const { t } = useTranslation('showcase')

  return (
    <Specimen label={t('specimens.page')} wide layout="column">
      <div className={styles.pageBox}>
        <PageHeader
          icon={Plug}
          iconTone="accent"
          title={t('samples.pageTitle')}
          help={
            <HelpButton
              label={t('samples.help')}
              title={t('samples.pageTitle')}
              text={t('samples.pageHelp')}
              closeLabel={t('samples.close')}
            />
          }
          actions={
            <Button size="sm" icon={Plus}>
              {t('samples.tileAddTitle')}
            </Button>
          }
        />
        <div className={styles.pageBody}>
          <Section
            title={t('samples.sectionTitle')}
            count={1}
            help={
              <HelpButton
                label={t('samples.help')}
                title={t('samples.sectionTitle')}
                text={t('samples.sectionHelp')}
                closeLabel={t('samples.close')}
              />
            }>
            <div className={styles.tileGrid}>
              <Tile
                icon={Mail}
                iconTone="danger"
                title={t('samples.tileTitle')}
                description={t('samples.tileDescription')}
                meta={t('samples.tileMeta')}
                status={<Badge tone="success">{t('samples.active')}</Badge>}
                onClick={() => undefined}
              />
            </div>
          </Section>
          <Section
            size="sm"
            title={t('samples.sectionCompactTitle')}
            count={3}
            description={t('samples.sectionCompactDescription')}
            actions={<IconButton icon={RotateCw} size="sm" label={t('samples.update')} />}>
            <p className={styles.sampleText}>{t('samples.sectionCompactBody')}</p>
          </Section>
        </div>
      </div>
    </Specimen>
  )
}
