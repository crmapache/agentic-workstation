import { usePanelCapabilities } from '../panel.queries'
import styles from './ComposerStatus.module.scss'
import type { ComposerStatusProps } from './ComposerStatus.types'
import { SetupPicker } from './parts/SetupPicker'
import { SetupPresets } from './parts/SetupPresets'
import { TodayTokens } from './parts/TodayTokens'
import { UsageRings } from './parts/UsageRings'

/**
 * Строка под полем ввода: слева модель, усилие и режим разговора одним индикатором и кнопки
 * пресетов за ним (ADR 0096), справа кольца лимитов в ряд и токены за день (если провайдер их
 * считает), как в ACC. Контекст - не здесь, а в ряду кнопок поля. Узкая панель - показания
 * стоят целиком, индикатор и пресеты делят остаток: пресетам - не больше половины.
 */
export const ComposerStatus = ({ conversation }: ComposerStatusProps) => {
  const { todayTokens, presets } = usePanelCapabilities()

  return (
    <div className={styles.composerStatus}>
      <div className={styles.setup}>
        <SetupPicker conversation={conversation} />
        {presets && <SetupPresets conversation={conversation} />}
      </div>
      <div className={styles.meters}>
        <UsageRings />
        {todayTokens && <TodayTokens />}
      </div>
    </div>
  )
}
