import styles from '../SendModal.module.scss'
import type { CardRowProps } from '../SendModal.types'
import { useScenarioName } from '../../tracker.hooks'

/** Строка карточки в списке отправки: номер в очереди, заголовок и её сценарий. */
export const CardRow = ({ card, index }: CardRowProps) => {
  const name = useScenarioName(card.scenario)

  return (
    <li className={styles.item}>
      <span className={styles.index}>{index + 1}</span>
      <span className={styles.cardTitle}>{card.title}</span>
      <span className={styles.scenarioName}>{name}</span>
    </li>
  )
}
