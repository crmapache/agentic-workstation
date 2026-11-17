/** Число двумя цифрами: 9 → «09». */
export const pad2 = (value: number): string => String(value).padStart(2, '0')

/** Минуты списка с шагом; значение не на шаге (09:07 из файла) тоже в списке - его видно выбранным. */
export const minutesOf = (step: number, current: number): number[] => {
  const safe = Math.min(Math.max(Math.round(step), 1), 30)
  const list = Array.from({ length: Math.ceil(60 / safe) }, (_, index) => index * safe)

  return list.includes(current) ? list : [...list, current].sort((left, right) => left - right)
}

/** Тот же час с другими минутами и наоборот - минуты от полуночи. */
export const withHour = (at: number, hour: number): number => hour * 60 + (at % 60)

export const withMinute = (at: number, minute: number): number => Math.floor(at / 60) * 60 + minute
