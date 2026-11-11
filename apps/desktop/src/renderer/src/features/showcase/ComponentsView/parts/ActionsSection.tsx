import {
  Bot,
  Zap,
  Play,
  Search,
  Trash2,
  ArrowUp,
  Ellipsis,
  Settings,
  GitBranch,
  SquareTerminal,
  GitCommitHorizontal,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Avatar } from '@agentic-workstation/ui/Avatar'
import { Button } from '@agentic-workstation/ui/Button'
import { DropdownButton } from '@agentic-workstation/ui/DropdownButton'
import { IconButton } from '@agentic-workstation/ui/IconButton'
import { ResizeHandle } from '@agentic-workstation/ui/ResizeHandle'
import { Tooltip } from '@agentic-workstation/ui/Tooltip'

import { SAMPLE_ICON_SIZE, SAMPLE_ICON_STROKE_WIDTH } from '../ComponentsView.constants'
import styles from '../ComponentsView.module.scss'
import { ShowcaseSection } from '../../ShowcaseSection/ShowcaseSection'
import { Specimen } from '../../Specimen/Specimen'

/**
 * Раздел «Действия»: кнопки всех вариантов и размеров, кнопки-иконки, переключатели,
 * подсказка и ручка изменения ширины.
 */
export const ActionsSection = () => {
  const { t } = useTranslation('showcase')

  return (
    <ShowcaseSection title={t('sections.actions')}>
      <Specimen label={t('specimens.buttons')}>
        <Button variant="primary" icon={Play}>
          {t('samples.run')}
        </Button>
        <Button variant="secondary" icon={GitCommitHorizontal}>
          {t('samples.commit')}
        </Button>
        <Button variant="ghost">{t('samples.cancel')}</Button>
        <Button variant="danger" icon={Trash2}>
          {t('samples.remove')}
        </Button>
        <Button variant="primary" disabled>
          {t('samples.disabled')}
        </Button>
      </Specimen>

      <Specimen label={t('specimens.buttonsSmall')}>
        <Button variant="primary" size="sm">
          {t('samples.primary')}
        </Button>
        <Button variant="secondary" size="sm">
          {t('samples.secondary')}
        </Button>
        <Button variant="ghost" size="sm">
          {t('samples.ghost')}
        </Button>
        <Button variant="danger" size="sm">
          {t('samples.remove')}
        </Button>
        <Button variant="secondary" size="sm" disabled>
          {t('samples.disabled')}
        </Button>
      </Specimen>

      <Specimen label={t('specimens.menuButtons')}>
        <Button size="sm" icon={Bot} menu>
          {t('samples.setUpWithAi')}
        </Button>
        <Button size="sm" icon={Bot} menu aria-expanded>
          {t('samples.setUpWithAi')}
        </Button>
        <Button menu>{t('samples.setUpWithAi')}</Button>
      </Specimen>

      <Specimen label={t('specimens.iconButtons')}>
        <IconButton icon={Search} label={t('samples.search')} />
        <IconButton icon={SquareTerminal} label={t('samples.terminal')} active />
        <IconButton icon={Settings} label={t('samples.settings')} disabled />
        <IconButton icon={Settings} label={t('samples.unavailable')} aria-disabled />
        <IconButton icon={Search} size="sm" label={t('samples.search')} />
        <IconButton icon={SquareTerminal} size="sm" label={t('samples.terminal')} active />
        <IconButton icon={Ellipsis} size="sm" label={t('samples.more')} aria-expanded />
        <IconButton icon={Search} size="xs" label={t('samples.search')} />
        <IconButton icon={ArrowUp} variant="primary" label={t('samples.send')} />
        <IconButton icon={ArrowUp} variant="primary" label={t('samples.send')} disabled />
      </Specimen>

      <Specimen label={t('specimens.dropdowns')}>
        <DropdownButton
          label={t('samples.project')}
          leading={<Avatar initials="AW" tone={0} />}
          menuLabel={t('samples.projectMenu')}
        />
        <DropdownButton
          label={t('samples.branch')}
          leading={
            <GitBranch size={SAMPLE_ICON_SIZE} strokeWidth={SAMPLE_ICON_STROKE_WIDTH} aria-hidden />
          }
          menuLabel={t('samples.branchMenu')}
        />
        <DropdownButton
          size="sm"
          label={t('samples.model')}
          leading={
            <Bot size={SAMPLE_ICON_SIZE} strokeWidth={SAMPLE_ICON_STROKE_WIDTH} aria-hidden />
          }
          menuLabel={t('samples.modelMenu')}
        />
        <DropdownButton
          size="sm"
          label={t('samples.setupLabel')}
          labelContent={
            <>
              {t('samples.setupValue')}
              <span className={styles.accentText}>{t('samples.setupMode')}</span>
            </>
          }
          leading={
            <Zap
              className={styles.accentText}
              size={SAMPLE_ICON_SIZE}
              strokeWidth={SAMPLE_ICON_STROKE_WIDTH}
              aria-hidden
            />
          }
          menuLabel={t('samples.setupMenu')}
        />
      </Specimen>

      <Specimen label={t('specimens.tooltip')}>
        <Tooltip label={t('samples.tooltipText')} placement="top">
          <Button variant="secondary">{t('samples.hoverMe')}</Button>
        </Tooltip>
      </Specimen>

      <Specimen label={t('specimens.resizeHandle')} layout="column">
        <div className={styles.resizeBox}>
          <ResizeHandle edge="end" label={t('samples.resizeLabel')} onResize={() => undefined} />
          <ResizeHandle
            edge="bottom"
            label={t('samples.resizeHeightLabel')}
            onResize={() => undefined}
          />
        </div>
      </Specimen>

      <Specimen label={t('specimens.resizeHandleInGap')} layout="column">
        <div className={styles.resizeSheets}>
          <div className={styles.resizeSheet} />
          <div className={styles.resizeSheet}>
            <ResizeHandle
              edge="start"
              inGap
              label={t('samples.resizeLabel')}
              onResize={() => undefined}
            />
          </div>
        </div>
      </Specimen>
    </ShowcaseSection>
  )
}
