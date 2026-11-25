import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Toast } from '@agentic-workstation/ui/Toast'

import { TOAST_SAMPLE_CLOSE_MS } from '../ComponentsView.constants'
import styles from '../ComponentsView.module.scss'
import { Specimen } from '../../Specimen/Specimen'

/**
 * Уведомления: с действием и крестиком «позже», с «от кого», значком «открыть целиком» и рядом
 * кнопок (напоминание о звонке), ошибка с крестиком, итог с кольцом отсчёта, длинное сообщение
 * коммита, свёрнутое до шести строк, и скачивание без крестика. Отсчёт живой: мышь над карточкой
 * держит его, раскрытая карточка не уходит вовсе, а ушедшая сразу встаёт снова - кольцо видно с
 * начала.
 */
export const ToastSpecimen = () => {
  const { t } = useTranslation('showcase')
  const [round, setRound] = useState(0)
  // Свой счёт у длинного: соседний образец с отсчётом встаёт заново каждые шесть секунд и иначе
  // сворачивал бы раскрытое вместе с собой.
  const [longRound, setLongRound] = useState(0)

  const handleAgain = () => setRound((current) => current + 1)
  const handleLongAgain = () => setLongRound((current) => current + 1)

  return (
    <Specimen label={t('specimens.toast')} layout="column">
      <div className={styles.stack}>
        <Toast
          title={t('samples.toastTitle')}
          description={t('samples.toastText')}
          close={{ label: t('samples.later'), onClose: () => undefined }}
          actions={
            <Button variant="primary" size="sm">
              {t('samples.update')}
            </Button>
          }
        />
        <Toast
          eyebrow={t('samples.toastEyebrow')}
          title={t('samples.toastCallTitle')}
          description={t('samples.toastCallText')}
          expand={{ label: t('samples.toastOpenAll'), onExpand: () => undefined }}
          close={{ label: t('samples.close'), onClose: () => undefined }}
          actions={
            <>
              <Button variant="primary" size="sm">
                {t('samples.toastJoin')}
              </Button>
              <Button variant="secondary" size="sm">
                {t('samples.toastShowCalendar')}
              </Button>
              <Button variant="ghost" size="sm">
                {t('samples.toastGotIt')}
              </Button>
            </>
          }
        />
        <Toast
          tone="danger"
          title={t('samples.toastDangerTitle')}
          description={t('samples.toastDangerText')}
          close={{ label: t('samples.close'), onClose: () => undefined }}
        />
        <Toast
          key={round}
          title={t('samples.toastCountdownTitle')}
          close={{
            label: t('samples.close'),
            onClose: handleAgain,
            autoCloseMs: TOAST_SAMPLE_CLOSE_MS,
          }}
          actions={
            <Button variant="secondary" size="sm">
              {t('samples.toastCountdownAction')}
            </Button>
          }
        />
        <Toast
          key={longRound}
          title={t('samples.toastLongTitle')}
          description={t('samples.toastLongText')}
          more={{ showLabel: t('samples.toastShowMore'), hideLabel: t('samples.toastShowLess') }}
          close={{
            label: t('samples.close'),
            onClose: handleLongAgain,
            autoCloseMs: TOAST_SAMPLE_CLOSE_MS,
          }}
        />
        <Toast
          title={t('samples.toastProgressTitle')}
          description={t('samples.toastProgressText')}
          progress={0.64}
        />
      </div>
    </Specimen>
  )
}
