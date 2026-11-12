import { formatTabReference } from '@agentic-workstation/browser-protocol/tab-reference'

import type { OffscreenCopy } from '../common/messages'

const OFFSCREEN_URL = 'offscreen/offscreen.html'

/** Сколько держать отметку «скопировано» на значке. */
const BADGE_MS = 1500

/**
 * Запись в буфер из сервис-воркера: у него нет document, поэтому - через offscreen-документ
 * (причина CLIPBOARD), который закрывается сразу после записи.
 */
export const writeClipboard = async (text: string): Promise<void> => {
  if (!(await chrome.offscreen.hasDocument())) {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: [chrome.offscreen.Reason.CLIPBOARD],
      justification: 'Copy a tab reference for the AI to the clipboard.',
    })
  }

  try {
    const message: OffscreenCopy = { target: 'offscreen', type: 'copy', text }
    const copied = (await chrome.runtime.sendMessage(message)) as unknown

    if (copied !== true) throw new Error('The clipboard refused the text.')
  } finally {
    await chrome.offscreen.closeDocument().catch(() => undefined)
  }
}

/**
 * Ссылка на вкладку для ИИ в буфер: `chrome-tab:<профиль>/<id>@<метка запуска> "Заголовок"`. На
 * значке - короткая отметка, что получилось: меню закрывается молча.
 */
export const copyTabReference = async (
  profile: { key: string; launch: string },
  tab: Pick<chrome.tabs.Tab, 'id' | 'title'>,
): Promise<void> => {
  const tabId = tab.id

  if (tabId === undefined || tabId < 0) return

  await writeClipboard(
    formatTabReference({ profileKey: profile.key, tabId, launch: profile.launch }, tab.title),
  )
  await chrome.action.setBadgeText({ tabId, text: '✓' })
  setTimeout(() => {
    void chrome.action.setBadgeText({ tabId, text: '' }).catch(() => undefined)
  }, BADGE_MS)
}
