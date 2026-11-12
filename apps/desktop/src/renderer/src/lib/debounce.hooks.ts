import { useState, useEffect } from 'react'

/**
 * Значение, на котором остановились: меняется через delay после последней правки. Чтобы не
 * спрашивать главный процесс на каждую букву (поиск везде, ссылки при переименовании).
 * Сравнение - по значению (Object.is): строку можно класть, объект с новым адресом - нет.
 */
export const useDebouncedValue = <Value>(value: Value, delay: number): Value => {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)

    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}
