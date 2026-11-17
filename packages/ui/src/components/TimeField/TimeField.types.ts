export type TimeFieldProps = {
  /** Подпись над полями: «At», «Time». */
  label: string
  /** Имена полей для скринридера: час и минуты. */
  hourLabel: string
  minuteLabel: string
  /** Минуты от полуночи. */
  value: number
  onChange: (value: number) => void
  /** Шаг минут в списке; по умолчанию 5 - договор с утром, а не будильник. */
  minuteStep?: number | undefined
  /** Только минуты часа - «каждый час в :15»: поля часа нет. */
  minutesOnly?: boolean | undefined
  /** Строка справа от полей: когда это наступит («Tomorrow, in 14 h»). */
  note?: string | undefined
}
