import {
  SPINNER_CENTER,
  SPINNER_STEP_DASH,
  SPINNER_PATH_LENGTH,
  SPINNER_STEP_ANGLES,
} from '../Spinner.constants'
import styles from '../Spinner.module.scss'
import type { SpinnerStepsProps } from '../Spinner.types'

/**
 * Кольцо из шагов (вариант steps): каждый шаг - свой штрих на круге, повёрнутый от верхней
 * точки. Огонёк по ним бежит задержками анимации в стилях, сам рисунок не вращается: шаги стоят
 * на месте, загораются по очереди.
 */
export const SpinnerSteps = ({ radius, stroke }: SpinnerStepsProps) =>
  SPINNER_STEP_ANGLES.map((angle) => (
    <circle
      key={angle}
      className={styles.step}
      cx={SPINNER_CENTER}
      cy={SPINNER_CENTER}
      r={radius}
      strokeWidth={stroke}
      pathLength={SPINNER_PATH_LENGTH}
      strokeDasharray={`${SPINNER_STEP_DASH} ${SPINNER_PATH_LENGTH}`}
      transform={`rotate(${angle} ${SPINNER_CENTER} ${SPINNER_CENTER})`}
    />
  ))
