import clsx from 'clsx'
import { useTranslation } from 'react-i18next'

import { RingMeter } from '@agentic-workstation/ui/RingMeter'
import { Tooltip } from '@agentic-workstation/ui/Tooltip'

import styles from '../Composer.module.scss'
import type { ContextMeterProps } from '../Composer.types'
import { contextTone, formatTokens } from '../../claude.utils'

/**
 * Сколько окна контекста занято - кольцо с процентом в ряду кнопок поля, сразу за лупой:
 * оно про то, что уйдёт со следующим сообщением (в ACC - полоса над текстом поля). Подписи
 * нет - что это контекст, говорят подсказка и место. Тон ступенями от зелёного к красному:
 * красное - скоро CLI сожмёт разговор сам. Точные цифры - в подсказке.
 */
export const ContextMeter = ({ conversation }: ContextMeterProps) => {
  const { t } = useTranslation()
  const { contextTokens, contextWindow } = conversation.usage
  const share = contextWindow > 0 ? contextTokens / contextWindow : 0
  const tone = contextTone(share)
  const hint =
    contextWindow > 0
      ? t('claudeCode.context.hint', {
          used: formatTokens(contextTokens),
          total: formatTokens(contextWindow),
        })
      : t('claudeCode.context.empty')

  return (
    <Tooltip label={hint} placement="top">
      <span className={styles.contextMeter} role="img" tabIndex={0} aria-label={hint}>
        <RingMeter value={share * 100} tone={tone} label={t('claudeCode.context.label')} />
        <span className={clsx(styles.contextValue, styles[tone])}>
          {t('claudeCode.context.percent', { value: Math.round(share * 100) })}
        </span>
      </span>
    </Tooltip>
  )
}
