/** warning - предупреждение (жёлтым), danger - отказ (красным). */
export type ScenarioAlertTone = 'warning' | 'danger'

export type ScenarioAlertProps = {
  tone?: ScenarioAlertTone | undefined
  /** Отказ, который только что случился: скринридер прочтёт его сразу (role="alert"). */
  alert?: boolean | undefined
  children: string
}
