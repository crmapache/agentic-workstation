import { useId } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Dialog } from '@agentic-workstation/ui/Dialog'
import { Slider } from '@agentic-workstation/ui/Slider'

import { useSettingsStore } from '../settings.store'
import { TEXT_SIZE } from '../../../state/text-size.constants'
import { useTextSizeStore } from '../../../state/text-size.store'
import styles from './SettingsDialog.module.scss'

/**
 * Настройки IDE (⌘,, Settings… в меню программы, действие поиска). Пока один раздел - вид:
 * размер текста всей IDE. Меняется сразу, под пальцем, и окно под диалогом не темнеет -
 * результат видно на самой IDE. Подтверждать нечего: Done только закрывает.
 */
export const SettingsDialog = () => {
  const { t } = useTranslation()
  const appearanceId = useId()
  const isOpen = useSettingsStore((state) => state.isOpen)
  const close = useSettingsStore((state) => state.close)
  const textSize = useTextSizeStore((state) => state.textSize)
  const setTextSize = useTextSizeStore((state) => state.setTextSize)
  const resetTextSize = useTextSizeStore((state) => state.resetTextSize)

  const actions = (
    <>
      <Button variant="ghost" disabled={textSize === TEXT_SIZE.default} onClick={resetTextSize}>
        {t('settings.textSize.reset')}
      </Button>
      <Button type="submit" variant="primary">
        {t('settings.done')}
      </Button>
    </>
  )

  return (
    <Dialog
      open={isOpen}
      title={t('settings.title')}
      backdrop="clear"
      actions={actions}
      onSubmit={close}
      onClose={close}>
      <section className={styles.section} aria-labelledby={appearanceId}>
        <h2 id={appearanceId} className={styles.sectionTitle}>
          {t('settings.appearance')}
        </h2>
        <Slider
          label={t('settings.textSize.label')}
          value={textSize}
          min={TEXT_SIZE.min}
          max={TEXT_SIZE.max}
          step={TEXT_SIZE.step}
          valueText={t('settings.textSize.value', { percent: textSize })}
          onChange={setTextSize}
        />
        <p className={styles.hint}>{t('settings.textSize.hint')}</p>
      </section>
    </Dialog>
  )
}
