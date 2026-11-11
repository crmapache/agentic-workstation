import { useState, useEffect } from 'react'
import type { RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import type { editor } from 'monaco-editor/editor/editor.api.js'

import { openWhenReleased } from '@agentic-workstation/ui/Popover.utils'

import { monaco } from '../monaco-setup'
import { MENU_TARGETS, WIDGET_LAYERS, SHOW_MENU_ACTION } from './EditorContextMenu.constants'
import type { MenuPoint } from './EditorContextMenu.types'
import { pointInEditor, pointUnderCaret } from './EditorContextMenu.utils'

type Editor = editor.IStandaloneCodeEditor

/**
 * Правый клик по коду - то, что делало включённое меню Monaco: фокус в код, каретка под мышь,
 * если клик мимо всех выделений (мультикурсор не схлопывается), и точка для меню от угла
 * рамки. На номерах строк и полосах - ничего.
 */
const pointedMenu = (instance: Editor, frame: HTMLElement, event: MouseEvent): MenuPoint | null => {
  const target = instance.getTargetAtClientPoint(event.clientX, event.clientY)

  event.preventDefault()
  if (!target || !MENU_TARGETS.has(target.type)) return null

  const { position } = target

  instance.focus()
  if (position && !instance.getSelections()?.some((range) => range.containsPosition(position))) {
    instance.setPosition(position)
  }

  return pointInEditor({ x: event.clientX, y: event.clientY }, frame.getBoundingClientRect())
}

/**
 * Где открыто меню правой кнопки в коде. Клик ловится на захвате, раньше Monaco: с
 * выключенным меню он сам ставил бы каретку под мышь и забирал фокус при любом правом
 * клике - и в поле ввода виджета, и на номерах строк. Меню открывается, когда кнопку отпустят;
 * клавиша меню и Shift+F10 - под кареткой, как у Monaco. Точка - от угла рамки, где стоит
 * якорь меню: у редактора файла это он сам, у стороны разницы - вся разница. Редактор к
 * вызову уже создан: хук стоит после хука, который его создаёт, а эффекты идут по порядку.
 */
export const useEditorContextMenu = (
  editorRef: RefObject<Editor | null>,
  frameRef?: RefObject<HTMLElement | null>,
) => {
  const { t } = useTranslation()
  const [at, setAt] = useState<MenuPoint | null>(null)

  useEffect(() => {
    const instance = editorRef.current

    if (!instance) return

    const host = instance.getContainerDomNode()
    const frame = frameRef?.current ?? host

    // Каретка могла уехать за край прокруткой - сначала показать её, как делает Monaco: иначе
    // меню встало бы за краем, невидимое, но с фокусом на пункте.
    const openAtCaret = () => {
      const position = instance.getPosition()

      if (!position) return

      instance.revealPosition(position, monaco.editor.ScrollType.Immediate)
      instance.render()

      const caret = pointUnderCaret(instance.getScrolledVisiblePosition(position))
      const offset = pointInEditor(host.getBoundingClientRect(), frame.getBoundingClientRect())

      if (caret) setAt({ x: caret.x + offset.x, y: caret.y + offset.y })
    }

    const handleContextMenu = (event: MouseEvent) => {
      event.stopPropagation()

      // Клавиша меню на клавиатуре: событие приходит полю ввода кода, а не точке.
      if (instance.hasTextFocus() && event.target === document.activeElement) {
        event.preventDefault()

        return openWhenReleased(event, openAtCaret)
      }

      // Виджет поверх кода (поле ввода, подсказка) - системное меню правки, как и у Monaco:
      // фокус остаётся в поле, вставка идёт в него, а не в код.
      if (event.target instanceof Element && event.target.closest(WIDGET_LAYERS)) return

      const point = pointedMenu(instance, frame, event)

      if (point) openWhenReleased(event, () => setAt(point))
    }

    host.addEventListener('contextmenu', handleContextMenu, { capture: true })

    // Файл сменился, пока меню открыто (⌘W из меню приложения): пункты - про прежний файл.
    const switching = instance.onDidChangeModel(() => setAt(null))

    // Под тем же именем, что у Monaco: и Shift+F10, и пункт палитры команд открывают наше меню,
    // а не выключенное.
    const keyboard = instance.addAction({
      id: SHOW_MENU_ACTION,
      label: t('editor.contextMenu.show'),
      keybindings: [monaco.KeyMod.Shift | monaco.KeyCode.F10],
      run: openAtCaret,
    })

    return () => {
      host.removeEventListener('contextmenu', handleContextMenu, { capture: true })
      switching.dispose()
      keyboard.dispose()
    }
  }, [editorRef, frameRef, t])

  const close = () => setAt(null)

  return { at, close }
}
