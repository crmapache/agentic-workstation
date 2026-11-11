import { Fragment, useState } from 'react'
import { MessageSquareShare } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Menu } from '@agentic-workstation/ui/Menu'
import { MenuItem } from '@agentic-workstation/ui/MenuItem'
import { MenuSeparator } from '@agentic-workstation/ui/MenuSeparator'
import { Popover } from '@agentic-workstation/ui/Popover'
import { useAnchoredPopover } from '@agentic-workstation/ui/Popover.hooks'

import { sendSelectionToChat } from '../editor-chat'
import { EDITOR_MENU, MENU_SOURCE } from './EditorContextMenu.constants'
import styles from './EditorContextMenu.module.scss'
import type { EditorContextMenuProps } from './EditorContextMenu.types'

/**
 * Меню правой кнопки в коде - нашим меню, как у вкладок, а не меню Monaco: то рисуется в
 * теневом DOM внутри панели редактора, куда не доходят цвета темы, и край панели его
 * обрезает. Встаёт у курсора мыши, пункт выполняет ту же команду Monaco, что и сочетание. У
 * файла проекта первым - «Send to Chat»: выделенный кусок в поле открытого чата ИИ.
 */
export const EditorContextMenu = ({
  editorRef,
  at,
  readOnly,
  chatOwner,
  hasSelection = false,
  onClose,
}: EditorContextMenuProps) => {
  const { t } = useTranslation()
  // Якорь - точка нажатия. Стоит всегда, а не появляется с точкой: иначе панель открылась бы
  // на рендер позже меню, и меню не поставило бы фокус на первый пункт.
  const [anchor, setAnchor] = useState<HTMLSpanElement | null>(null)
  const { id, ref, onToggle } = useAnchoredPopover(at ? anchor : null, onClose)

  // Пункт сначала закрывает меню, и фокус возвращается в код: буфер обмена и правка всех
  // вхождений работают только у редактора с фокусом.
  const handleRun = (command: string) => editorRef.current?.trigger(MENU_SOURCE, command, null)

  const handleSendToChat = () => {
    if (editorRef.current && chatOwner) sendSelectionToChat(editorRef.current, chatOwner)
  }

  return (
    <>
      <span
        ref={setAnchor}
        className={styles.anchor}
        // eslint-disable-next-line no-restricted-syntax -- точка нажатия известна только в рантайме
        style={at ? { left: at.x, top: at.y } : undefined}
      />
      <Popover id={id} ref={ref} onToggle={onToggle}>
        {at && (
          <Menu label={t('editor.contextMenu.label')} autoFocus>
            {chatOwner && (
              <>
                <MenuItem
                  icon={MessageSquareShare}
                  label={t('editor.contextMenu.sendToChat')}
                  disabled={!hasSelection}
                  onSelect={handleSendToChat}
                />
                <MenuSeparator />
              </>
            )}
            {EDITOR_MENU.map((group, index) => (
              <Fragment key={group[0]?.name}>
                {index > 0 && <MenuSeparator />}
                {group.map((entry) => (
                  <MenuItem
                    key={entry.name}
                    icon={entry.icon}
                    label={t(`editor.contextMenu.${entry.name}`)}
                    hint={entry.keys}
                    disabled={readOnly && entry.edits}
                    onSelect={() => handleRun(entry.command)}
                  />
                ))}
              </Fragment>
            ))}
          </Menu>
        )}
      </Popover>
    </>
  )
}
