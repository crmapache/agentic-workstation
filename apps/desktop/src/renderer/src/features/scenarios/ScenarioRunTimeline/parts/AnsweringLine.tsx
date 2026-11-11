import styles from '../ScenarioRunTimeline.module.scss'
import type { AnsweringLineProps } from '../ScenarioRunTimeline.types'

/**
 * «Главный поток пишет ответ» под словами человека - тем же переливом, что строка «думает» в
 * ленте провайдера (ADR 0025): ответ ляжет сюда же, и до него видно, что слова услышаны.
 */
export const AnsweringLine = ({ text }: AnsweringLineProps) => (
  <span role="status" className={styles.answering}>
    <span className={styles.shimmer}>{text}</span>
  </span>
)
