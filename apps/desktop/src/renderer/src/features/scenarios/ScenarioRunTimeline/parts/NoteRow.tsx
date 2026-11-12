import clsx from 'clsx'
import { useTranslation } from 'react-i18next'

import { RUN_ROW } from '../ScenarioRunTimeline.constants'
import styles from '../ScenarioRunTimeline.module.scss'
import type { NoteRowProps } from '../ScenarioRunTimeline.types'
import { moveWords } from '../../scenarios-run.utils'
import { AnsweringLine } from './AnsweringLine'
import { Glance } from './Glance'

/**
 * Слова между шагами - своим блоком, а не строкой шага: главный поток (Markdown, и что он
 * передал карточке), человек (как написал; ждут, пока голова занята) и сама IDE - переезд
 * прогона на другой аккаунт или ожидание лимита.
 */
export const NoteRow = ({ rowKey, note, isOver, isAnswering }: NoteRowProps) => {
  const { t } = useTranslation()
  const isPerson = note.who === 'person'
  const move = note.who === 'panel' ? note.move : null
  // Только у идущего прогона: кончившийся унёс недошедшие слова с собой.
  const isWaiting = isPerson && !isOver && note.deliveredAt === 0
  const who = isPerson
    ? t('scenarios.run.notes.you')
    : note.who === 'panel'
      ? t('scenarios.run.notes.panel')
      : t('scenarios.run.notes.head')

  return (
    <div className={styles.row} {...{ [RUN_ROW]: rowKey }}>
      <span className={styles.rail} />
      <div
        className={clsx(
          styles.note,
          isPerson && styles.notePerson,
          move?.reason === 'limit' && styles.noteLimit,
        )}>
        <span className={styles.noteWho}>{who}</span>
        {move ? (
          <div className={styles.noteText}>{moveWords(t, move)}</div>
        ) : isPerson || note.who === 'panel' ? (
          note.text && <div className={clsx(styles.noteText, styles.noteVerbatim)}>{note.text}</div>
        ) : (
          note.text && <Glance text={note.text} isInert={false} />
        )}
        {isWaiting && (
          <span className={styles.noteWaiting}>{t('scenarios.run.notes.waiting')}</span>
        )}
        {note.relayed && (
          <div className={styles.relayed}>
            <span className={styles.relayedLabel}>{t('scenarios.run.notes.passedOn')}</span>
            <Glance text={note.relayed} isInert={false} />
          </div>
        )}
        {isAnswering && <AnsweringLine text={t('scenarios.run.notes.answering')} />}
      </div>
    </div>
  )
}
