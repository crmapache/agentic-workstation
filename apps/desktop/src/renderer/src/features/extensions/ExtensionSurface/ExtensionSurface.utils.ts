import type { UiNode, UiValues } from '@shared/extension-ui'

/** Значения полей, объявленные деревом: то, что расширение поставило в поле само. */
export const declaredValues = (tree: UiNode | null): UiValues => {
  const values: UiValues = {}
  const visit = (node: UiNode) => {
    if (node.type === 'textField' || node.type === 'textArea' || node.type === 'select') {
      values[node.name] = node.value ?? ''
    } else if (node.type === 'switch') {
      values[node.name] = node.checked ?? false
    }

    if ('children' in node) node.children.forEach(visit)
    if ('actions' in node && node.actions) node.actions.forEach(visit)
  }

  if (tree) visit(tree)

  return values
}

/**
 * Значения после нового дерева: поле, которое расширение поменяло само, берёт новое значение,
 * остальные - то, что человек уже набрал. Иначе перерисовка вида посреди набора стирала бы его.
 */
export const mergedValues = (current: UiValues, before: UiValues, after: UiValues): UiValues =>
  Object.fromEntries(
    Object.entries(after).map(([name, value]) => [
      name,
      before[name] !== value || !(name in current) ? value : (current[name] ?? value),
    ]),
  )

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })

/** Число на графике расширения: 1.2k, 3.4M. */
export const chartValue = (value: number): string => compact.format(value)

/** Значение текстового поля: флажок или пусто - пустая строка. */
export const textOf = (value: string | boolean | undefined): string =>
  typeof value === 'string' ? value : ''

/** Имя класса модуля по слову расширения: tone + muted - toneMuted. */
export const classFor = (prefix: string, word: string): string =>
  `${prefix}${word.charAt(0).toUpperCase()}${word.slice(1)}`
