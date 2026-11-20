import { useEffect } from 'react'
import type { RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import type { editor } from 'monaco-editor/editor/editor.api.js'

import { useEditorServicesAvailable } from '../../state/memory-saver.queries'
import { wordStart, watchDefinitionLinks } from './definition-links'
import { askDefinition, goToDefinition } from './definition-lookup'
import type { DefinitionOwner } from './definition-lookup'
import { hasDefinitions } from './definition.utils'
import { GO_TO_DECLARATION_ACTION } from './editor.constants'
import { monaco } from './monaco-setup'

type Editor = editor.IStandaloneCodeEditor

/** Определение имени под кареткой - и переход к нему; нет определения - ничего. */
const goToDeclarationAtCaret = async (
  instance: Editor,
  owner: DefinitionOwner | null,
  active: () => boolean,
) => {
  const model = instance.getModel()
  const position = instance.getPosition()
  const start =
    model && position && owner && hasDefinitions(owner.path) ? wordStart(model, position) : null

  if (!model || !owner || start === null) return

  const answer = await askDefinition(owner, model, start)

  if (active() && answer.kind === 'found' && instance.getModel() === model)
    goToDefinition(owner, answer.target)
}

/**
 * Переход к определению в редакторе файла (ADR 0061): ⌘ + наведение делает имя ссылкой, ⌘ +
 * клик ведёт к определению; ⌘B и F12 - то же для имени под кареткой, как в WebStorm (и пункт
 * меню правой кнопки). owner - файл, который сейчас в редакторе.
 */
export const useDefinitionLinks = (
  editorRef: RefObject<Editor | null>,
  owner: RefObject<DefinitionOwner | null>,
) => {
  const { t } = useTranslation()
  const available = useEditorServicesAvailable()

  useEffect(() => {
    const instance = editorRef.current

    if (!instance || !available) return

    let active = true

    const links = watchDefinitionLinks(instance, () => owner.current)
    const action = instance.addAction({
      id: GO_TO_DECLARATION_ACTION,
      label: t('editor.contextMenu.goToDeclaration'),
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyB, monaco.KeyCode.F12],
      run: () => goToDeclarationAtCaret(instance, owner.current, () => active),
    })

    return () => {
      active = false
      links.dispose()
      action.dispose()
    }
  }, [editorRef, owner, t, available])
}
