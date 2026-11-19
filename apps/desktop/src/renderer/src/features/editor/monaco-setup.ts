import * as monaco from 'monaco-editor/editor/editor.api.js'
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker'

import 'monaco-editor/features/register.all.js'
import './monaco.css'

import { onExtensionThemeApplied } from '../../state/extension-theme'
/**
 * Monaco по частям (ADR 0005): ядро, все функции правки VS Code и свои языки с
 * подсветкой shiki - без встроенных языковых сервисов, интеллект кода придёт от LSP.
 * Модуль грузится вместе с редактором, при первом открытом файле, и настраивает Monaco
 * один раз на окно.
 */
import { MONACO_FIND_COMMANDS } from './editor.constants'
import { registerLanguages } from './monaco-languages'
import { defineEditorTheme } from './monaco-theme'

;(self as { MonacoEnvironment?: monaco.Environment }).MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
}

registerLanguages(monaco)
defineEditorTheme(monaco)
// Тема расширений (ADR 0091) меняет роли --color-*: Monaco цвета из CSS сам не перечитывает,
// тема переопределяется заново и сразу ложится на все редакторы окна.
onExtensionThemeApplied(() => defineEditorTheme(monaco))

// ⌘⇧O в IDE - поиск файлов (поиск везде), а не переход к символу Monaco: иначе в
// редакторе открывались бы оба окна разом.
monaco.editor.addKeybindingRule({
  keybinding: monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyO,
  command: '-editor.action.quickOutline',
})

// Панели поиска Monaco нет: ⌘F, ⌥⌘F, ⌘G, ⌘E и переключатели поиска свободны для своего
// поиска IDE. Правило без сочетания (0) снимает все сочетания команды.
monaco.editor.addKeybindingRules(
  [...MONACO_FIND_COMMANDS].map((command) => ({ keybinding: 0, command: `-${command}` })),
)

// F7 и Shift+F7 в разнице - к следующей и предыдущей правке, как в WebStorm (DiffEditor), а
// не окно доступного просмотра разницы Monaco: оно остаётся в палитре команд.
monaco.editor.addKeybindingRules(
  ['editor.action.accessibleDiffViewer.next', 'editor.action.accessibleDiffViewer.prev'].map(
    (command) => ({ keybinding: 0, command: `-${command}` }),
  ),
)

export { monaco }
