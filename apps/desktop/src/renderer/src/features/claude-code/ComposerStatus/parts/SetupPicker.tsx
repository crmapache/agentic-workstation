import clsx from 'clsx'
import { useTranslation } from 'react-i18next'

import { DropdownButton } from '@agentic-workstation/ui/DropdownButton'
import { Popover } from '@agentic-workstation/ui/Popover'
import { usePopover } from '@agentic-workstation/ui/Popover.hooks'
import { Tooltip } from '@agentic-workstation/ui/Tooltip'

import { MODE_TONES, SETUP_SEPARATOR } from '../ComposerStatus.constants'
import styles from '../ComposerStatus.module.scss'
import type { PickerProps } from '../ComposerStatus.types'
import { setupValue } from '../ComposerStatus.utils'
import { usePanelPrefs, useModelCatalog } from '../../claude.queries'
import { FAST_MARK } from '../../model-chip.constants'
import { modelChip } from '../../model-chip.utils'
import { pickableModels } from '../../models.utils'
import { SetupPanel } from './SetupPanel'

/**
 * Модель, усилие и режим разговора одним индикатором под полем (своё IDE; в ACC - три
 * селектора): «Opus 5.5 · High effort · Auto». Режим - тоном слова, без иконки впереди: она
 * повторяла слово и только теснила строку. Модель не та (CLI сменил сам,
 * выбор не доехал) - жёлтым, ↯ - быстрый режим. По нажатию - панель с
 * разделами Model, Effort и Mode (SetupPanel): от модели шагами к режиму или разовая правка
 * одного раздела вкладкой.
 */
export const SetupPicker = ({ conversation }: PickerProps) => {
  const { t } = useTranslation()
  const popover = usePopover()
  const prefs = usePanelPrefs()
  const models = pickableModels(useModelCatalog(), prefs.customModels)
  const chip = modelChip(conversation, models, t)
  const value = setupValue(conversation, chip, t)
  const tone = MODE_TONES[conversation.permissionMode]

  return (
    <>
      <Tooltip label={value.hint} placement="top">
        <DropdownButton
          {...popover.triggerProps}
          size="sm"
          label={value.label}
          labelContent={
            <>
              <span className={clsx(chip.warning && styles.warning)}>{value.model}</span>
              {chip.fast && (
                <span className={clsx(styles.fastMark, styles[chip.fast])}>{FAST_MARK}</span>
              )}
              {SETUP_SEPARATOR}
              {value.effort}
              {SETUP_SEPARATOR}
              <span className={styles[tone]}>{value.mode}</span>
            </>
          }
          menuLabel={t('claudeCode.status.setup')}
        />
      </Tooltip>
      <Popover {...popover.popoverProps} width="md">
        {popover.isOpen && <SetupPanel conversation={conversation} />}
      </Popover>
    </>
  )
}
