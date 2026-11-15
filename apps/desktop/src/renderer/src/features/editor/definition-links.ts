import type { editor, IPosition, IDisposable } from 'monaco-editor/editor/editor.api.js'

import type { TextSpan, DefinitionTarget } from '@shared/definitions'

import { IS_MAC } from '../../lib/platform'
import { textVersion, askDefinition, goToDefinition } from './definition-lookup'
import type { DefinitionOwner } from './definition-lookup'
import { spanHolds, hasDefinitions } from './definition.utils'
import { DEFINITION_LINK_CLASS } from './editor.constants'
import { monaco } from './monaco-setup'

type Editor = editor.IStandaloneCodeEditor

/** Имя-ссылка под мышью: в какой версии текста, где оно и куда ведёт. */
type Link = TextSpan & { version: string; target: DefinitionTarget }

const LINK_DECORATION: editor.IModelDecorationOptions = { inlineClassName: DEFINITION_LINK_CLASS }

/** Клавиша ссылки: ⌘ на macOS, Ctrl на Windows - как в WebStorm и VS Code. */
const TRIGGER_KEY = IS_MAC ? monaco.KeyCode.Meta : monaco.KeyCode.Ctrl

const withTrigger = (event: { metaKey: boolean; ctrlKey: boolean }) =>
  IS_MAC ? event.metaKey : event.ctrlKey

/** Начало слова под позицией - смещением в тексте; null - под позицией не слово. */
export const wordStart = (model: editor.ITextModel, position: IPosition): number | null => {
  const word = model.getWordAtPosition(position)

  return word
    ? model.getOffsetAt({ lineNumber: position.lineNumber, column: word.startColumn })
    : null
}

/**
 * ⌘ + наведение в коде (ADR 0061): имя, у которого есть определение, становится ссылкой -
 * подчёркнуто цветом ссылки, курсор - рука; ⌘ + клик ведёт к определению. Жест как у VS Code
 * (ClickLinkGesture): ⌘ нажали над именем - ссылка появляется без движения мыши; ⌘ с другой
 * клавишей - это сочетание, ссылка гаснет; клик с протяжкой (выделение) никуда не ведёт.
 * Главный процесс спрашивается раз на имя: имя без определения запоминается до правки.
 */
export const watchDefinitionLinks = (
  instance: Editor,
  owner: () => DefinitionOwner | null,
): IDisposable => {
  const decorations = instance.createDecorationsCollection()
  let link: Link | null = null
  let miss: string | null = null
  let pointer: IPosition | null = null
  let pressedLine: number | null = null
  /** Имя, о котором вопрос уже задан: мышь, которая ёрзает по нему, не спрашивает снова. */
  let asking: string | null = null
  let serial = 0

  const clear = () => {
    serial += 1
    asking = null
    if (!link) return

    link = null
    decorations.clear()
  }

  const show = async (position: IPosition) => {
    const model = instance.getModel()
    const who = owner()
    const start = model && who && hasDefinitions(who.path) ? wordStart(model, position) : null

    if (!model || !who || start === null) return clear()

    const version = textVersion(model)
    const key = `${version}:${start}`

    if ((link?.version === version && spanHolds(link, start)) || asking === key) return

    clear()
    if (miss === key) return

    asking = key

    const ticket = serial
    const answer = await askDefinition(who, model, start)

    if (ticket !== serial || instance.getModel() !== model || textVersion(model) !== version) return

    asking = null
    if (answer.kind !== 'found') {
      miss = key

      return
    }

    link = { ...answer.origin, version, target: answer.target }
    decorations.set([
      {
        range: monaco.Range.fromPositions(
          model.getPositionAt(answer.origin.start),
          model.getPositionAt(answer.origin.end),
        ),
        options: LINK_DECORATION,
      },
    ])
  }

  const follow = (position: IPosition | null) => {
    const model = instance.getModel()
    const who = owner()
    const current = link

    if (!model || !who || !current || !position) return
    if (!spanHolds(current, model.getOffsetAt(position))) return

    clear()
    goToDefinition(who, current.target)
  }

  const subscriptions = [
    instance.onMouseMove((event) => {
      const isText = event.target.type === monaco.editor.MouseTargetType.CONTENT_TEXT

      pointer = isText ? event.target.position : null
      if (pointer && withTrigger(event.event)) void show(pointer)
      else clear()
    }),
    instance.onMouseLeave(() => {
      pointer = null
      clear()
    }),
    instance.onKeyDown((event) => {
      if (event.keyCode === TRIGGER_KEY && pointer) void show(pointer)
      else if (withTrigger(event)) clear()
    }),
    instance.onKeyUp((event) => {
      if (event.keyCode === TRIGGER_KEY) clear()
    }),
    instance.onMouseDown((event) => {
      const isPlainClick = event.event.leftButton && event.event.detail <= 1

      pressedLine =
        isPlainClick && withTrigger(event.event)
          ? (event.target.position?.lineNumber ?? null)
          : null
    }),
    instance.onMouseUp((event) => {
      const position = event.target.position
      const isSameLine = pressedLine !== null && position?.lineNumber === pressedLine

      pressedLine = null
      if (isSameLine) follow(position)
    }),
    // Протянули с ⌘ - это выделение, а не переход.
    instance.onDidChangeCursorSelection((event) => {
      if (!event.selection.isEmpty()) clear()
    }),
    instance.onDidChangeModel(() => {
      miss = null
      clear()
    }),
    instance.onDidChangeModelContent(clear),
    instance.onDidScrollChange((event) => {
      if (event.scrollTopChanged || event.scrollLeftChanged) clear()
    }),
  ]

  return {
    dispose: () => {
      clear()
      for (const subscription of subscriptions) subscription.dispose()
    },
  }
}
