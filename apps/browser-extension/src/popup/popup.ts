import type { HostChannel } from '@agentic-workstation/browser-protocol/protocol'

import type { LinkView, PopupState, PopupRequest } from '../common/messages'
import { linkRows, DOT_CLASS, LINK_TEXT, CHANNEL_TEXT } from './popup.utils'

/**
 * Окно значка (ADR 0040): связь с IDE, имя этого профиля (ИИ видит его рядом с вкладками),
 * сессии агентов со Stop и ссылка на текущую вкладку. Без фреймворка: окно маленькое и
 * открывается на каждый щелчок по значку.
 */

const text = (key: string, substitutions?: string[]): string =>
  chrome.i18n.getMessage(key, substitutions) || key

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag)

  if (className) node.className = className

  node.append(...children)

  return node
}

const ask = <T>(request: PopupRequest): Promise<T> => chrome.runtime.sendMessage(request)

const root = document.getElementById('popup') as HTMLElement

const header = (): HTMLElement => {
  const icon = el('img', 'headerIcon')

  icon.src = chrome.runtime.getURL('icons/icon-32.png')
  icon.alt = ''

  return el('header', 'header', icon, el('span', 'title', text('popupTitle')))
}

const profileSection = (state: PopupState): HTMLElement => {
  const field = el('input', 'field')

  field.id = 'profile-name'
  field.value = state.profile.name
  field.maxLength = 60

  const save = () => {
    if (field.value.trim() !== state.profile.name) {
      void ask<PopupState>({ type: 'popup:rename', name: field.value }).then(render)
    }
  }

  field.addEventListener('change', save)
  field.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') field.blur()
  })

  const label = el('label', 'caps', text('popupProfile'))

  // Что значит имя, говорит сама подпись: пояснений абзацем на виду нет (ADR 0030).
  label.htmlFor = field.id

  return el('section', 'section', label, field)
}

const linkRow = (link: LinkView): HTMLElement =>
  el(
    'div',
    'row',
    el('span', `dot ${DOT_CLASS[link.state]}`),
    el('span', 'rowName', text(CHANNEL_TEXT[link.channel])),
    el('span', 'rowMeta', text(LINK_TEXT[link.state])),
  )

const connectionSection = (state: PopupState): HTMLElement => {
  const { rows, missing } = linkRows(state.links)
  const section = el('section', 'section', el('span', 'caps', text('popupConnection')))

  section.append(...rows.map(linkRow))

  if (missing) section.append(el('span', 'hint', text('hostMissingHint')))

  return section
}

const stopButton = (channel: HostChannel, sessionId: string): HTMLButtonElement => {
  const button = el('button', 'button sm secondary', text('stop'))

  button.type = 'button'
  button.addEventListener('click', () => {
    button.disabled = true
    void ask({ type: 'popup:stop', channel, sessionId })
  })

  return button
}

const sessionsSection = (state: PopupState): HTMLElement => {
  const section = el('section', 'section', el('span', 'caps', text('popupSessions')))
  const sessions = state.links.flatMap((link) =>
    link.sessions.map((session) => ({ channel: link.channel, session })),
  )

  if (!sessions.length) section.append(el('span', 'hint', text('popupNoSessions')))

  for (const { channel, session } of sessions) {
    section.append(
      el(
        'div',
        'row',
        el('span', 'rowName', session.title),
        el(
          'span',
          'rowMeta',
          session.tabIds.length === 1
            ? text('sessionOneTab')
            : text('sessionTabs', [String(session.tabIds.length)]),
        ),
        stopButton(channel, session.id),
      ),
    )
  }

  return section
}

const copyButton = (state: PopupState): HTMLElement => {
  const button = el('button', 'button sm primary', text('copyThisTab'))
  const tab = state.tab

  button.type = 'button'
  button.disabled = !tab
  button.addEventListener('click', () => {
    if (!tab) return

    void ask<boolean>({ type: 'popup:copy', tabId: tab.id }).then((copied) => {
      if (copied === true) button.textContent = text('copied')
    })
  })

  return button
}

const render = (state: PopupState): void => {
  root.replaceChildren(
    header(),
    profileSection(state),
    connectionSection(state),
    sessionsSection(state),
    copyButton(state),
  )
}

const refresh = () => void ask<PopupState>({ type: 'popup:state' }).then(render)

chrome.runtime.onMessage.addListener((message: { type?: string }) => {
  // Поле имени в фокусе - не перерисовывать: человек печатает.
  if (message?.type === 'popup:changed' && !(document.activeElement instanceof HTMLInputElement)) {
    refresh()
  }
})

refresh()
