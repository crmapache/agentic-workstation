import { useTranslation } from 'react-i18next'

import type { RunWire, RunNoteWire } from '@agentic-workstation/remote-protocol/wire-types'
import { Section } from '@agentic-workstation/ui/Section'
import { Spinner } from '@agentic-workstation/ui/Spinner'

import styles from '../RunScreen.module.scss'
import { lastTold } from '../RunScreen.utils'
import { isRunOver } from '../../../../lib/status.constants'
import { clockText, durationText } from '../../../../lib/time.utils'
import { Markdown } from '../../../../shell/Markdown/Markdown'

/**
 * Что голова делает с последними словами человека, как в IDE: пишет ответ (сколько уже) или ждёт,
 * пока освободится. Иначе после «отправить» экран молчал до самого ответа, и было не понять, дошло
 * ли. Прогон кончился - ждать нечего, строки нет.
 */
const HeadReply = ({ run, note, now }: { run: RunWire; note: RunNoteWire; now: number }) => {
  const { t } = useTranslation()

  if (isRunOver(run.state)) return null

  if (run.answering) {
    return (
      <p className={styles.headReply} role="status">
        <Spinner size="sm" tone="accent" />
        <span className={styles.headReplyText}>
          {note.deliveredAt
            ? t('run.headAnswering', { time: durationText(t, now - note.deliveredAt) })
            : t('run.headAnsweringNow')}
        </span>
      </p>
    )
  }

  if (note.deliveredAt !== 0) return null

  return (
    <p className={styles.headReply} role="status">
      <Spinner size="sm" tone="neutral" />
      <span className={styles.headWaitText}>{t('run.headBusy')}</span>
    </p>
  )
}

/**
 * Разговор с головой: что ей писали и что она отвечала, по времени (часам телефона). Под
 * последними словами человека - пишет ли голова ответ.
 */
export const RunNotes = ({ run, now, offset }: { run: RunWire; now: number; offset: number }) => {
  const { t } = useTranslation()
  const told = lastTold(run.notes)

  if (run.notes.length === 0) return null

  return (
    <Section size="sm" title={t('run.notes')} count={run.notes.length}>
      <div className={styles.notes}>
        {run.notes.map((note, index) => (
          <div key={`${note.at}-${index}`} className={styles.note}>
            <span className={styles.noteHead}>
              {t('run.noteHead', {
                who: t(`run.who.${note.who || 'head'}`, { defaultValue: note.who }),
                at: clockText(note.at - offset),
              })}
            </span>
            <Markdown text={note.text} />
            {note === told && <HeadReply run={run} note={note} now={now} />}
          </div>
        ))}
      </div>
    </Section>
  )
}
