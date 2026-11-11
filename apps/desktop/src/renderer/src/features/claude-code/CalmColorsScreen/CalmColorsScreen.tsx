import clsx from 'clsx'
import { useTranslation } from 'react-i18next'

import { GAUGE_VIVID_CALM, GAUGE_VIVID_FULL } from '@shared/claude-prefs'

import { Card } from '@agentic-workstation/ui/Card'
import { ProgressBar } from '@agentic-workstation/ui/ProgressBar'
import { RingMeter } from '@agentic-workstation/ui/RingMeter'
import { Slider } from '@agentic-workstation/ui/Slider'

import { useClaudeActions } from '../claude-actions.hooks'
import { usePanelPrefs } from '../claude.queries'
import { useDelayedSave } from '../delayed-save.hooks'
import { SLIDER_SAVE_MS } from '../panel-look.constants'
import { usageTone } from '../usage.utils'
import { PanelScreen } from '../PanelScreen/PanelScreen'
import { CALM_LADDER, CALM_BAR_PERCENT } from './CalmColorsScreen.constants'
import styles from './CalmColorsScreen.module.scss'
import { vividStyle } from './CalmColorsScreen.utils'

/**
 * Спокойные цвета (Settings → No-stress colors): сколько цвета остаётся шкалам - кольцам
 * контекста и лимитов, полосам и процентам аккаунтов. Образец собран из тех же примитивов
 * и ступеней, что настоящие шкалы, и перекрашивается под пальцем. Ошибки остаются
 * красными: это то, что случилось, а не настроение.
 */
export const CalmColorsScreen = () => {
  const { t } = useTranslation()
  const prefs = usePanelPrefs()
  const { setPrefs } = useClaudeActions()
  const [vivid, setVivid] = useDelayedSave(
    prefs.gaugeVivid,
    (gaugeVivid) => setPrefs({ gaugeVivid }),
    SLIDER_SAVE_MS,
  )
  const percent = (value: number) => t('claudeCode.calmColors.percent', { value })

  return (
    <PanelScreen title={t('claudeCode.menu.titles.calmColors.title')}>
      <Card title={t('claudeCode.calmColors.sample')}>
        {/* eslint-disable-next-line no-restricted-syntax -- доля цвета образца меняется под пальцем */}
        <div className={styles.sample} style={vividStyle(vivid)} data-gauge-calm="">
          <ProgressBar
            value={CALM_BAR_PERCENT / 100}
            tone={usageTone(CALM_BAR_PERCENT, '')}
            label={percent(CALM_BAR_PERCENT)}
          />
          <div className={styles.ladder}>
            {CALM_LADDER.map((step) => (
              <span key={step.value} className={clsx(styles.step, styles[step.tone])}>
                <RingMeter value={step.value} tone={step.tone} label={percent(step.value)} />
                {percent(step.value)}
              </span>
            ))}
          </div>
        </div>
      </Card>
      <div className={styles.control}>
        <Slider
          label={t('claudeCode.calmColors.label')}
          value={vivid}
          min={GAUGE_VIVID_CALM}
          max={GAUGE_VIVID_FULL}
          valueText={percent(vivid)}
          onChange={setVivid}
        />
        <span className={styles.hint}>{t('claudeCode.calmColors.hint')}</span>
      </div>
    </PanelScreen>
  )
}
