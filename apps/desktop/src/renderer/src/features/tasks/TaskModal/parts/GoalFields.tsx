import { useTranslation } from 'react-i18next'

import { GOAL_BUDGETS, GOAL_LIFE_DAYS, GOAL_OUTBOUNDS } from '@shared/goals'
import type { GoalOutbound } from '@shared/goals'

import styles from '../TaskModal.module.scss'
import type { GoalFieldsProps } from '../TaskModal.types'
import { ChoiceField } from './ChoiceField'

/**
 * Пределы поручения (ADR 0080): как писать людям (по умолчанию - каждое сообщение с кнопки
 * человека), деньги на всю жизнь и через сколько дней без результата сдаться. Свой предел денег,
 * которого нет в списке, остаётся в нём вариантом - иначе его не увидеть.
 */
export const GoalFields = ({ draft, onChange }: GoalFieldsProps) => {
  const { t } = useTranslation()
  const { goal } = draft
  const set = (patch: Partial<typeof goal>) => onChange({ goal: { ...goal, ...patch } })
  const outbounds = GOAL_OUTBOUNDS.map((outbound) => ({
    value: outbound,
    label: t(`tasks.form.outbounds.${outbound}.label`),
    description: t(`tasks.form.outbounds.${outbound}.note`),
  }))
  const budgets = [...new Set([...GOAL_BUDGETS, goal.budgetUsd])]
    .sort((left, right) => left - right)
    .map((amount) => ({
      value: String(amount),
      label: t('tasks.form.budgetValue', { amount }),
    }))
  const days = [...new Set([...GOAL_LIFE_DAYS, goal.lifeDays])]
    .sort((left, right) => left - right)
    .map((count) => ({ value: String(count), label: t('tasks.form.lifeDaysValue', { count }) }))

  return (
    <>
      <span className={styles.note}>{t('tasks.form.goalNote')}</span>
      <ChoiceField
        label={t('tasks.form.outbound')}
        value={goal.outbound}
        choices={outbounds}
        onPick={(outbound) => set({ outbound: outbound as GoalOutbound })}
      />
      <div className={styles.row}>
        <ChoiceField
          label={t('tasks.form.budget')}
          value={String(goal.budgetUsd)}
          choices={budgets}
          onPick={(amount) => set({ budgetUsd: Number(amount) })}
        />
        <ChoiceField
          label={t('tasks.form.lifeDays')}
          value={String(goal.lifeDays)}
          choices={days}
          onPick={(count) => set({ lifeDays: Number(count) })}
        />
      </div>
    </>
  )
}
