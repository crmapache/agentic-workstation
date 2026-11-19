import styles from '../SearchWindow.module.scss'

/**
 * Слово кнопки, которая меняет его на другое (Find и Cancel): невидимое второе слово
 * держит место, и кнопка не меняет ширину ровно в момент нажатия.
 */
export const SteadyWord = ({ word, other }: { word: string; other: string }) => (
  <span className={styles.steady}>
    <span>{word}</span>
    <span className={styles.steadyGhost} aria-hidden>
      {other}
    </span>
  </span>
)
