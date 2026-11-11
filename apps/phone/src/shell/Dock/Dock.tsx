import { Card } from '@agentic-workstation/ui/Card'

import styles from './Dock.module.scss'
import type { DockProps } from './Dock.types'

/**
 * Решение над полем ввода - разговору (разрешение, вопрос, план) или прогону (вопрос головы):
 * карточка не выше потолка, лента над ней видна. Шапка и кнопки решения стоят, прокручивается
 * только то, что решают: кнопки не уходят за край, как бы длинен ни был вызов.
 */
export const Dock = ({ icon, title, description, actions, children }: DockProps) => (
  <div className={styles.dock}>
    <Card fit tone="accent" icon={icon} title={title} description={description}>
      <div className={styles.layout}>
        <div className={styles.scroll}>{children}</div>
        <div className={styles.actions}>{actions}</div>
      </div>
    </Card>
  </div>
)
