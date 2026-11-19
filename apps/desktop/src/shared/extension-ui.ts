/**
 * Интерфейс расширения (ADR 0091): декларативное дерево из примитивов дизайн-системы. Своего
 * HTML и CSS у расширения нет - окно рисует дерево нашими компонентами, поэтому расширение не
 * ломает раскладку и стиль IDE, а всё нарисованное им выглядит своим.
 */

/** Тон текста и плашки: смысл цвета тот же, что во всей IDE. */
export type UiTone = 'default' | 'muted' | 'accent' | 'success' | 'warning' | 'danger' | 'info'

export type UiGap = 'sm' | 'md' | 'lg'

export type UiListItem = {
  id: string
  title: string
  description?: string | undefined
  icon?: string | undefined
  badge?: { text: string; tone?: UiTone | undefined } | undefined
  /** Действие по нажатию строки; без него строка не нажимается. */
  action?: string | undefined
}

export type UiOption = { value: string; label: string; description?: string | undefined }

/** Узел дерева. Поля ввода и переключатели - с name: их значения едут в событии вида. */
export type UiNode =
  | { type: 'stack'; gap?: UiGap | undefined; children: UiNode[] }
  | {
      type: 'row'
      gap?: UiGap | undefined
      align?: 'start' | 'center' | 'end' | 'between' | undefined
      wrap?: boolean | undefined
      children: UiNode[]
    }
  | {
      type: 'section'
      title: string
      description?: string | undefined
      actions?: UiNode[] | undefined
      children: UiNode[]
    }
  | {
      type: 'card'
      title?: string | undefined
      description?: string | undefined
      tone?: 'neutral' | 'accent' | undefined
      actions?: UiNode[] | undefined
      children: UiNode[]
    }
  | {
      type: 'text'
      text: string
      tone?: UiTone | undefined
      size?: 'sm' | 'md' | undefined
      mono?: boolean | undefined
      strong?: boolean | undefined
    }
  | { type: 'markdown'; text: string }
  | { type: 'code'; text: string }
  | { type: 'badge'; text: string; tone?: UiTone | undefined }
  | {
      type: 'button'
      label: string
      action: string
      variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | undefined
      icon?: string | undefined
      disabled?: boolean | undefined
    }
  | {
      type: 'textField'
      name: string
      label: string
      value?: string | undefined
      placeholder?: string | undefined
    }
  | {
      type: 'textArea'
      name: string
      label: string
      value?: string | undefined
      placeholder?: string | undefined
    }
  | { type: 'select'; name: string; label: string; value?: string | undefined; options: UiOption[] }
  | {
      type: 'switch'
      name: string
      label: string
      description?: string | undefined
      checked?: boolean | undefined
    }
  | { type: 'list'; items: UiListItem[] }
  | { type: 'keyValue'; items: { label: string; value: string }[] }
  | { type: 'progress'; value?: number | undefined; label?: string | undefined }
  | { type: 'empty'; title: string; description?: string | undefined; icon?: string | undefined }
  | {
      type: 'chart'
      title: string
      layout?: 'grouped' | 'stacked' | undefined
      series: { key: string; label: string }[]
      points: { key: string; label: string; values: number[] }[]
    }
  | { type: 'divider' }

export type UiNodeType = UiNode['type']

/** Значения полей вида в момент события: имя поля - строка или флажок. */
export type UiValues = Record<string, string | boolean>

/** Событие вида расширения: кнопка или строка списка (action), правка поля (change). */
export type UiEvent =
  | { kind: 'action'; action: string; values: UiValues }
  | { kind: 'change'; name: string; value: string | boolean; values: UiValues }

/** Дерево вида целиком: окно держит последнее по ключу вида. */
export type ExtensionViewTree = { key: string; tree: UiNode | null; revision: number }

/** Вопрос расширения человеку - окном поверх IDE. */
export type ExtensionDialog =
  | {
      kind: 'prompt'
      title: string
      label: string
      value: string
      placeholder: string
      multiline: boolean
    }
  | { kind: 'confirm'; title: string; body: string; confirmLabel: string; danger: boolean }
  | { kind: 'pick'; title: string; items: UiOption[] }

/** Вопрос в окне: чей и с каким id ответить. */
export type ExtensionDialogRequest = {
  requestId: string
  extensionId: string
  extensionName: string
  dialog: ExtensionDialog
}

/** Ответ окна на вопрос: null - закрыл без ответа. */
export type ExtensionDialogAnswer = string | boolean | null

/** Пределы дерева: больше - расширение получает ошибку, окно ничего не рисует. */
export const UI_LIMITS = {
  depth: 24,
  nodes: 2000,
  text: 20_000,
} as const
