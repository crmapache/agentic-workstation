import { useState } from 'react'
import { Play, Search, Trash2, ArrowUp, ShieldQuestion } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Card } from '@agentic-workstation/ui/Card'
import { IconButton } from '@agentic-workstation/ui/IconButton'
import { Modal } from '@agentic-workstation/ui/Modal'
import { TextField } from '@agentic-workstation/ui/TextField'

import styles from '../ComponentsView.module.scss'
import { Specimen } from '../../Specimen/Specimen'

/**
 * Размеры под палец (телефонный клиент Remote Control): кнопки touch, длинная подпись в узкой
 * колонке переносится, поле touch ростом с кнопку, карточка fit над полем ввода (текст
 * прокручивается, кнопки на виду) и окно с крестиком под палец.
 */
export const TouchSpecimens = () => {
  const { t } = useTranslation('showcase')
  const [answer, setAnswer] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)

  return (
    <>
      <Specimen label={t('specimens.buttonsTouch')}>
        <Button variant="primary" size="touch" icon={Play}>
          {t('samples.run')}
        </Button>
        <Button variant="secondary" size="touch">
          {t('samples.secondary')}
        </Button>
        <Button variant="danger" size="touch" icon={Trash2}>
          {t('samples.remove')}
        </Button>
        <IconButton icon={Search} size="touch" label={t('samples.search')} />
        <IconButton icon={ArrowUp} size="touch" variant="primary" label={t('samples.send')} />
      </Specimen>

      <Specimen label={t('specimens.buttonsTouchWrap')} layout="column">
        <div className={styles.touchPair}>
          <Button size="touch">{t('samples.keepGoing')}</Button>
          <Button size="touch" variant="primary">
            {t('samples.openRun')}
          </Button>
        </div>
      </Specimen>

      <Specimen label={t('specimens.textFieldTouch')} layout="column">
        <TextField
          size="touch"
          label={t('samples.answerLabel')}
          placeholder={t('samples.answerPlaceholder')}
          value={answer}
          onChange={setAnswer}
        />
      </Specimen>

      <Specimen label={t('specimens.cardFit')} layout="column">
        <div className={styles.fitBox}>
          <Card fit tone="accent" icon={ShieldQuestion} title={t('samples.fitTitle')}>
            <div className={styles.fitLayout}>
              <p className={styles.fitScroll}>{t('samples.fitBody')}</p>
              <div className={styles.touchPair}>
                <Button size="touch" variant="danger">
                  {t('samples.deny')}
                </Button>
                <Button size="touch" variant="primary">
                  {t('samples.allowOnce')}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </Specimen>

      <Specimen label={t('specimens.modalTouch')}>
        <Button variant="secondary" size="touch" onClick={() => setIsModalOpen(true)}>
          {t('samples.openModal')}
        </Button>
        <Modal
          open={isModalOpen}
          title={t('samples.modalTitle')}
          description={t('samples.modalDescription')}
          closeLabel={t('samples.close')}
          closeSize="touch"
          onClose={() => setIsModalOpen(false)}>
          {t('samples.modalBody')}
        </Modal>
      </Specimen>
    </>
  )
}
