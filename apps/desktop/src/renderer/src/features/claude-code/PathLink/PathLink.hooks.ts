import { useState, useCallback } from 'react'

import { useAnchoredPopover } from '@agentic-workstation/ui/Popover.hooks'

import { useOpenFileAction } from '../../../state/open-file.context'
import type { OpenFileRequest } from '../../../state/open-file.context'

/**
 * Нажатие на путь и его исход: «нет такого» помечает ссылку (следующее нажатие
 * спрашивает диск снова - файл мог вернуться), несколько одноимённых - меню выбора под
 * ссылкой. Меню открывается не нажатием, а ответом главного процесса, поэтому панель
 * показывается из кода с ссылкой-якорем и живёт, только пока открыта.
 */
export const usePathOpening = (request: OpenFileRequest) => {
  const openFile = useOpenFileAction()
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null)
  const [isMissing, setIsMissing] = useState(false)
  const [candidates, setCandidates] = useState<string[] | null>(null)
  // Панель выбора есть, пока есть одноимённые: закрылась (выбор, клик мимо) - их больше нет.
  const popoverProps = useAnchoredPopover(candidates ? anchor : null, () => setCandidates(null))

  const open = useCallback(
    async (target: OpenFileRequest) => {
      if (!openFile) return

      const outcome = await openFile(target)

      setIsMissing(outcome.kind === 'missing')
      setCandidates(outcome.kind === 'choose' ? outcome.candidates : null)
    },
    [openFile],
  )

  return {
    canOpen: openFile !== null,
    isMissing,
    candidates,
    anchorRef: setAnchor,
    popoverProps,
    open: () => open(request),
    // Место (строка, find) едет и с выбранным файлом: оно про файл, а не про имя.
    choose: (relativePath: string) => open({ ...request, path: relativePath }),
  }
}
