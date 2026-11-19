import clsx from 'clsx'

import { Tooltip } from '@agentic-workstation/ui/Tooltip'

import { answerChips } from '../scenarios-forms.utils'
import styles from './ScenarioFormsAnswers.module.scss'
import type { ScenarioFormsAnswersProps } from './ScenarioFormsAnswers.types'

/**
 * Пары «имя: значение» чипами: ответы, с которыми пойдёт или шёл прогон (запись очереди, час
 * расписания, прошлый прогон), и слоты, которые голова вписала в карточку. Задача, поставленная
 * на ночь, читается без открытия формы: значение - сколько влезает в строку, ссылка режется с
 * начала (различает её хвост), длинное - первой строкой, целиком - в подсказке.
 */
export const ScenarioFormsAnswers = ({ inputs }: ScenarioFormsAnswersProps) =>
  answerChips(inputs).map(({ name, value, link }) => (
    <Tooltip key={name} label={`${name}: ${inputs[name] ?? value}`}>
      <span className={styles.chip}>
        <span className={styles.name}>{name}</span>
        <span className={clsx(styles.value, link && styles.link)}>
          <bdi className={styles.text}>{value}</bdi>
        </span>
      </span>
    </Tooltip>
  ))
