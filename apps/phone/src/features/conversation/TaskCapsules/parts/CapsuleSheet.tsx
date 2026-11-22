import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Modal } from '@agentic-workstation/ui/Modal'

import styles from '../TaskCapsules.module.scss'
import type { CapsuleSheetProps } from '../TaskCapsules.types'
import { sheetLines, capsuleTitle, sheetSubtitle } from '../TaskCapsules.utils'
import { useNow } from '../../../../lib/now.hooks'
import { PathText } from '../../../../shell/PathText/PathText'

/**
 * Лист задачи по нажатию на капсулу: что это, сколько идёт (у будильника - сколько ждать), чем
 * занята, поручение или команда целиком и «остановить» во всю ширину. Лист и есть «точно?»:
 * человек видит, что останавливает, прежде чем нажать. Кончилась задача - лист уходит с капсулой.
 */
export const CapsuleSheet = ({ capsule, offset, onStop, onClose }: CapsuleSheetProps) => {
  const { t } = useTranslation()
  const now = useNow(1000)
  const subtitle = sheetSubtitle(t, capsule, now + offset)

  const handleStop = () => {
    onStop?.(capsule)
    onClose()
  }

  return (
    <Modal
      open
      title={capsuleTitle(t, capsule, offset)}
      description={subtitle || undefined}
      closeLabel={t('common.close')}
      closeSize="touch"
      onClose={onClose}
      footer={
        onStop &&
        capsule.stop && (
          <div className={styles.sheetActions}>
            <Button size="touch" variant="danger" onClick={handleStop}>
              {t(`capsules.stop.${capsule.kind}`)}
            </Button>
          </div>
        )
      }>
      <div className={styles.sheet}>
        {sheetLines(t, capsule).map((line) => (
          <section key={line.key} className={styles.sheetPart}>
            <h3 className={styles.sheetLabel}>{line.label}</h3>
            {line.code ? (
              <pre className={styles.sheetCode}>
                <PathText text={line.value} />
              </pre>
            ) : (
              <p className={styles.sheetText}>
                <PathText text={line.value} />
              </p>
            )}
          </section>
        ))}
      </div>
    </Modal>
  )
}
