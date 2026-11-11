import styles from '../ScheduleTab.module.scss'
import type { TimetableDayProps } from '../ScheduleTab.types'
import { TimetableRow } from './TimetableRow'

/**
 * День расписания: заголовок (Today, Tomorrow или день с датой) и строки по часу. Три
 * договорённости одного сценария перестают быть тремя одинаковыми строками - на вопрос «когда»
 * отвечено до того, как что-то прочитано. Пропущенные часы стоят такой же группой.
 */
export const TimetableDay = ({ title, note, rows, now, ...actions }: TimetableDayProps) => (
  <section aria-label={title} className={styles.day}>
    <div className={styles.dayHead}>
      <span className={styles.dayTitle}>{title}</span>
      {note && <span className={styles.dayNote}>{note}</span>}
      <span className={styles.dayLine} />
    </div>
    <ul className={styles.rows}>
      {rows.map((row) => (
        <TimetableRow key={row.schedule.id} row={row} now={now} {...actions} />
      ))}
    </ul>
  </section>
)
