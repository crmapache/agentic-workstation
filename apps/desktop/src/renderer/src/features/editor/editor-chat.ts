import type { editor } from 'monaco-editor/editor/editor.api.js'

import { useChatHandoffStore } from '../../state/chat-handoff.store'
import { useLayoutStore } from '../../state/layout.store'
import { snippetChip } from './editor-chat.utils'
import { selectionLines } from './CodeEditor/CodeEditor.utils'

/** Чей текст в редакторе: файл проекта. */
export type ChatOwner = { projectId: string; path: string }

/** Есть ли что отправить: непустое выделение. */
export const hasChatSelection = (instance: editor.ICodeEditor | null): boolean =>
  Boolean(instance?.getSelection() && !instance.getSelection()?.isEmpty())

/**
 * «Send to Chat»: выделенный кусок - чипом в поле открытого чата провайдера ИИ. Панель
 * провайдера спрятана - показать: кусок она возьмёт, когда встанет на экран.
 */
export const sendSelectionToChat = (instance: editor.ICodeEditor, owner: ChatOwner): void => {
  const model = instance.getModel()
  const range = instance.getSelection()

  if (!model || !range || range.isEmpty()) return

  useChatHandoffStore.getState().hand({
    projectId: owner.projectId,
    chip: snippetChip(owner.path, selectionLines(range), model.getValueInRange(range)),
  })

  const { provider, selectProviderView } = useLayoutStore.getState()

  if (!provider.isOpen) selectProviderView(provider.activeViewId)
}
