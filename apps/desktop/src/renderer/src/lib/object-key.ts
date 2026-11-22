const keys = new WeakMap<object, number>()

let lastKey = 0

/**
 * Ключ React для события из стора (итог действия, «Undo»): стор кладёт на каждое событие новый
 * объект, и по ключу новое событие получает новую карточку, а с ней и новый отсчёт до
 * самозакрытия, даже если текст тот же («Pushed» дважды подряд).
 */
export const objectKey = (value: object): number => {
  const known = keys.get(value)

  if (known !== undefined) return known

  lastKey += 1
  keys.set(value, lastKey)

  return lastKey
}
