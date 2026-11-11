import { useTranslation } from 'react-i18next'

import type { RunNoteWire } from '@agentic-workstation/remote-protocol/wire-types'
import { Section } from '@agentic-workstation/ui/Section'

import styles from '../RunScreen.module.scss'
import { clockText } from '../../../../lib/time.utils'
import { Markdown } from '../../../../shell/Markdown/Markdown'

/** Разговор с головой: что ей писали и что она отвечала, по времени. */
export const RunNotes = ({ notes }: { notes: RunNoteWire[] }) => {
  const { t } = useTranslation()

  if (notes.length === 0) return null

  return (
    <Section size="sm" title={t('run.notes')} count={notes.length}>
      <div className={styles.notes}>
        {notes.map((note, index) => (
          <div key={`${note.at}-${index}`} className={styles.note}>
            <span className={styles.noteHead}>
              {t('run.noteHead', {
                who: t(`run.who.${note.who || 'head'}`, { defaultValue: note.who }),
                at: clockText(note.at),
              })}
            </span>
            <Markdown text={note.text} />
          </div>
        ))}
      </div>
    </Section>
  )
}
