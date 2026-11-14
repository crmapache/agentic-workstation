import {
  Pin,
  Mail,
  Plus,
  FilePlus,
  FolderOpen,
  MoreHorizontal,
  SquareTerminal,
  MousePointerClick,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Avatar } from '@agentic-workstation/ui/Avatar'
import { Badge } from '@agentic-workstation/ui/Badge'
import { Card } from '@agentic-workstation/ui/Card'
import { EmptyState } from '@agentic-workstation/ui/EmptyState'
import { IconButton } from '@agentic-workstation/ui/IconButton'
import { Kbd } from '@agentic-workstation/ui/Kbd'
import { Menu } from '@agentic-workstation/ui/Menu'
import { MenuItem } from '@agentic-workstation/ui/MenuItem'
import { MenuSection } from '@agentic-workstation/ui/MenuSection'
import { MenuSeparator } from '@agentic-workstation/ui/MenuSeparator'
import { Tile } from '@agentic-workstation/ui/Tile'

import { KBD_SAMPLES } from '../ComponentsView.constants'
import styles from '../ComponentsView.module.scss'
import { ShowcaseSection } from '../../ShowcaseSection/ShowcaseSection'
import { Specimen } from '../../Specimen/Specimen'
import { PageSpecimen } from './PageSpecimen'
import { PageToolbarSpecimen } from './PageToolbarSpecimen'
import { PanelHeaderSpecimen } from './PanelHeaderSpecimen'

/**
 * Раздел «Поверхности»: вид с шапкой и разделами, шапка с нижним рядом вкладок, карточка,
 * плитки сеткой, пустое состояние и меню вне всплывающей панели.
 */
export const SurfacesSection = () => {
  const { t } = useTranslation('showcase')

  return (
    <ShowcaseSection title={t('sections.surfaces')}>
      <PageSpecimen />
      <PageToolbarSpecimen />
      <PanelHeaderSpecimen />

      <Specimen label={t('specimens.card')} layout="column">
        <Card
          title={t('samples.cardTitle')}
          description={t('samples.cardDescription')}
          actions={<IconButton icon={MoreHorizontal} size="sm" label={t('samples.more')} />}>
          {t('samples.cardBody')}
          <div className={styles.cardBadges}>
            <Badge tone="success">{t('samples.active')}</Badge>
            <Badge tone="accent">{t('samples.ahead')}</Badge>
            <Kbd keys={KBD_SAMPLES[0] ?? []} />
          </div>
        </Card>
        <Card size="sm" title={t('samples.cardCompactTitle')} count={3}>
          {t('samples.cardCompactBody')}
        </Card>
        {/* Нажимается вся (onPress): под курсором светлеет, кнопки внутри - сами по себе. */}
        <Card size="sm" title={t('samples.cardPressTitle')} onPress={() => undefined}>
          {t('samples.cardPressBody')}
        </Card>
      </Specimen>

      <Specimen label={t('specimens.tile')} layout="column">
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
          <Tile
            icon={SquareTerminal}
            title={t('samples.tileMutedTitle')}
            description={t('samples.tileMutedDescription')}
            meta={t('samples.tileMeta')}
            status={<Badge tone="neutral">{t('samples.tileOff')}</Badge>}
            muted
            onClick={() => undefined}
          />
          <Tile
            icon={Plus}
            iconTone="accent"
            variant="dashed"
            title={t('samples.tileAddTitle')}
            description={t('samples.tileAddDescription')}
            wrapDescription
            onClick={() => undefined}
          />
        </div>
      </Specimen>

      <Specimen label={t('specimens.emptyState')} layout="column">
        <div className={styles.emptyBox}>
          <EmptyState
            icon={MousePointerClick}
            title={t('samples.emptyTitle')}
            description={t('samples.emptyText')}
          />
        </div>
      </Specimen>

      <Specimen label={t('specimens.menu')} layout="column">
        <div className={styles.menuBox}>
          <Menu label={t('samples.menuLabel')}>
            <MenuItem icon={FilePlus} label={t('samples.newFile')} onSelect={() => undefined} />
            <MenuItem
              icon={FolderOpen}
              label={t('samples.openFile')}
              hint={t('samples.notBuilt')}
              disabled
              onSelect={() => undefined}
            />
            <MenuItem
              icon={Pin}
              label={t('samples.pinItem')}
              description={t('samples.pinCrowded')}
              wrapDescription
              disabled
              onSelect={() => undefined}
            />
            <MenuSeparator />
            <MenuSection title={t('samples.menuSection')}>
              <MenuItem
                leading={<Avatar initials="AW" tone={0} />}
                label={t('samples.currentItem')}
                description={t('samples.currentPath')}
                current
                onSelect={() => undefined}
              />
              <MenuItem
                leading={<Avatar initials="RR" tone={1} />}
                label={t('samples.otherItem')}
                description={t('samples.otherPath')}
                onSelect={() => undefined}
              />
            </MenuSection>
          </Menu>
        </div>
      </Specimen>
    </ShowcaseSection>
  )
}
