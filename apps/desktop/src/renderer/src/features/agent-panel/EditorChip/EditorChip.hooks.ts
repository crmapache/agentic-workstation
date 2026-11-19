import type { EditorRef } from '@shared/message-draft'

import type { EditorFit } from '../composer-fit.utils'
import { useComposerStore } from '../composer.store'
import { useConversationActions } from '../conversation-actions.hooks'
import { editorKey, editorGoes, editorLabel, editorChoice } from '../editor-context.utils'
import { usePanelPrefs } from '../panel.queries'

/**
 * Состояние чипа открытого файла: уходит ли файл со следующим сообщением, выключена ли
 * настройка без исключения и действия трёх пунктов меню. Крайние пункты - сама
 * настройка (Settings → Open file and selection), средний - одно сообщение наоборот;
 * любая смена настройки исключение сбрасывает.
 */
export const useEditorChip = (key: string, editor: EditorRef | null) => {
  const { shareEditor } = usePanelPrefs()
  const { setPrefs } = useConversationActions()
  const once = useComposerStore((store) => store.editorOnce[key])
  const setEditorOnce = useComposerStore((store) => store.setEditorOnce)

  if (!editor) return null

  const goes = editorGoes(shareEditor, once, editor)

  const setShared = (value: boolean) => {
    setEditorOnce(key, null)

    if (value !== shareEditor) void setPrefs({ shareEditor: value })
  }

  return {
    goes,
    shared: shareEditor,
    muted: !shareEditor && !goes,
    label: editorLabel(editor),
    choice: editorChoice(shareEditor, once, editor),
    always: () => setShared(true),
    never: () => setShared(false),
    once: () => setEditorOnce(key, { key: editorKey(editor), on: !shareEditor }),
  }
}

/**
 * Чем чип открытого файла может уступить место в ряду кнопок (composer-fit.utils.ts): имя
 * у обычного, себя целиком - у выключенного; нет файла - ничем.
 */
export const useEditorFit = (key: string, editor: EditorRef | null): EditorFit => {
  const chip = useEditorChip(key, editor)

  return chip ? (chip.muted ? 'muted' : 'named') : null
}
