import { useTranslation } from 'react-i18next'

import { ClosableTab } from '@agentic-workstation/ui/ClosableTab'

import styles from '../ComponentsView.module.scss'
import { Specimen } from '../../Specimen/Specimen'

/**
 * Полоса разговоров (ClosableTab width="grow"): группа с выбранной головой и форком со
 * ступенью отступа, длинное имя, обрезанное посередине, и вкладки, позвавшие человека
 * цветом повода - успех, внимание, ошибка. Ниже - последняя пустая вкладка: закрывать нечего,
 * крестика нет (closable).
 */
export const TabStripSpecimen = () => {
  const { t } = useTranslation('showcase')
  const noop = () => undefined

  return (
    <Specimen label={t('specimens.tabStrip')} wide layout="column">
      <div role="tablist" aria-label={t('specimens.tabStrip')} className={styles.tabStripWrap}>
        <ClosableTab
          width="grow"
          tinted
          active
          label={t('samples.chatTitle')}
          hint={t('samples.chatTitle')}
          closeLabel={t('samples.close')}
          onActivate={noop}
          onClose={noop}
        />
        <ClosableTab
          width="grow"
          tinted
          indent={1}
          call="success"
          groupEnd
          active={false}
          label={t('samples.chatFork')}
          hint={t('samples.chatFork')}
          closeLabel={t('samples.close')}
          onActivate={noop}
          onClose={noop}
        />
        <ClosableTab
          width="grow"
          tinted
          groupEnd
          active={false}
          label={t('samples.chatLong')}
          hint={t('samples.chatLong')}
          closeLabel={t('samples.close')}
          onActivate={noop}
          onClose={noop}
        />
        <ClosableTab
          width="grow"
          tinted
          call="attention"
          groupEnd
          active={false}
          label={t('samples.chatCalling')}
          hint={t('samples.chatCalling')}
          closeLabel={t('samples.close')}
          onActivate={noop}
          onClose={noop}
        />
        <ClosableTab
          width="grow"
          tinted
          call="danger"
          calm
          active={false}
          label={t('samples.otherItem')}
          hint={t('samples.otherItem')}
          closeLabel={t('samples.close')}
          onActivate={noop}
          onClose={noop}
        />
      </div>
      <div role="tablist" aria-label={t('samples.chatNew')} className={styles.tabStripWrap}>
        <ClosableTab
          width="grow"
          tinted
          active
          closable={false}
          label={t('samples.chatNew')}
          hint={t('samples.chatNew')}
          closeLabel={t('samples.close')}
          onActivate={noop}
          onClose={noop}
        />
      </div>
    </Specimen>
  )
}
