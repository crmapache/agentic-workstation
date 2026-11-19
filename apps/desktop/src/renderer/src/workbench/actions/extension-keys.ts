import { useMemo, useEffect, useEffectEvent } from 'react'

import { matchesExtensionKeys } from '../../lib/extension-keys'
import { invoke } from '../../lib/ipc'
import { withMacKeys } from '../../lib/keys'
import { useExtensions } from '../../state/extensions.queries'

/**
 * Клавиши команд расширений (ADR 0091). Слушатель - на всплытии, а не на захвате: клавиши IDE
 * (свои хуки на захвате, редактор, меню приложения) срабатывают раньше и гасят событие - то,
 * что IDE уже занимает, остаётся за ней. В открытом окне-вопросе клавиши расширений молчат.
 */
export const useExtensionKeys = () => {
  const { data } = useExtensions()
  const commands = useMemo(
    () =>
      (data?.extensions ?? [])
        .flatMap((extension) => extension.contributions.commands)
        .filter((command): command is typeof command & { keys: string } => command.keys !== null),
    [data],
  )

  const handleKey = useEffectEvent((event: KeyboardEvent) => {
    if (commands.length === 0 || event.defaultPrevented || document.querySelector('dialog:modal'))
      return

    const stroke = withMacKeys(event)
    const command = commands.find((candidate) => matchesExtensionKeys(candidate.keys, stroke))

    if (!command) return

    event.preventDefault()
    void invoke('extensions:runCommand', { key: command.key })
  })

  useEffect(() => {
    const listener = (event: KeyboardEvent) => handleKey(event)

    window.addEventListener('keydown', listener)

    return () => window.removeEventListener('keydown', listener)
  }, [])
}
