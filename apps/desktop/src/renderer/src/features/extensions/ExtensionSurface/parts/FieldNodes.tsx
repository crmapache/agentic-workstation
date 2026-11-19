import { Button } from '@agentic-workstation/ui/Button'
import { ChoiceField } from '@agentic-workstation/ui/ChoiceField'
import { Switch } from '@agentic-workstation/ui/Switch'
import { TextArea } from '@agentic-workstation/ui/TextArea'
import { TextField } from '@agentic-workstation/ui/TextField'

import { useSurface } from '../ExtensionSurface.context'
import type { NodeProps } from '../ExtensionSurface.types'
import { textOf } from '../ExtensionSurface.utils'
import { extensionIcon } from '../../../../lib/extension-icons'

/** Кнопка: событие action со всеми значениями формы. */
export const ButtonNode = ({ node }: NodeProps<'button'>) => {
  const surface = useSurface()

  return (
    <Button
      size="sm"
      variant={node.variant ?? 'secondary'}
      icon={node.icon ? extensionIcon(node.icon) : undefined}
      disabled={node.disabled}
      onClick={() => surface.act(node.action)}>
      {node.label}
    </Button>
  )
}

export const TextFieldNode = ({ node }: NodeProps<'textField'>) => {
  const surface = useSurface()

  return (
    <TextField
      label={node.label}
      placeholder={node.placeholder}
      value={textOf(surface.values[node.name])}
      onChange={(value) => surface.setValue(node.name, value)}
    />
  )
}

export const TextAreaNode = ({ node }: NodeProps<'textArea'>) => {
  const surface = useSurface()

  return (
    <TextArea
      label={node.label}
      placeholder={node.placeholder}
      value={textOf(surface.values[node.name])}
      onChange={(value) => surface.setValue(node.name, value)}
    />
  )
}

/** Выбор из списка - ChoiceField: поле с подписью и меню. */
export const SelectNode = ({ node }: NodeProps<'select'>) => {
  const surface = useSurface()

  return (
    <ChoiceField
      label={node.label}
      value={textOf(surface.values[node.name])}
      options={node.options}
      onPick={(value) => surface.setValue(node.name, value)}
    />
  )
}

export const SwitchNode = ({ node }: NodeProps<'switch'>) => {
  const surface = useSurface()

  return (
    <Switch
      label={node.label}
      description={node.description}
      checked={surface.values[node.name] === true}
      onChange={(checked) => surface.setValue(node.name, checked)}
    />
  )
}
