import styles from '../FleetAgentView.module.scss'
import type { FleetSectionProps } from '../FleetAgentView.types'

/** Раздел окна агента флота: подпись капсом и текст как есть, с переносами. */
export const FleetSection = ({ caption, text }: FleetSectionProps) => (
  <section className={styles.section}>
    <div className={styles.caption}>{caption}</div>
    <div className={styles.text}>{text}</div>
  </section>
)
