import { Tooltip } from '@agentic-workstation/ui/Tooltip'

import { answerChips } from '../scenarios-forms.utils'
import styles from './ScenarioFormsAnswers.module.scss'
import type { ScenarioFormsAnswersProps } from './ScenarioFormsAnswers.types'

/**
 * Пары «имя: значение» чипами: ответы, с которыми пойдёт или шёл прогон (запись очереди, час
 * расписания, прошлый прогон), и слоты, которые голова вписала в карточку. Задача, поставленная
 * на ночь, читается без открытия формы; ссылка - хвостом, длинное - первой строкой, целиком - в
 * подсказке.
 */
export const ScenarioFormsAnswers = ({ inputs }: ScenarioFormsAnswersProps) =>
  answerChips(inputs).map(({ name, value }) => (
    <Tooltip
      key={name}
      label={`${name}: ${inputs[name] ?? value}`}
      disabled={(inputs[name] ?? '').trim() === value}>
      <span className={styles.chip}>
        <span className={styles.name}>{name}</span>
        <span className={styles.value}>{value}</span>
      </span>
    </Tooltip>
  ))
