import type { HostChannel, SessionSummary } from '@agentic-workstation/browser-protocol/protocol'

/**
 * Сообщения внутри расширения: окно значка ↔ сервис-воркер, сервис-воркер → offscreen
 * (буфер обмена) и → курсор на странице. С IDE расширение говорит протоколом
 * browser-protocol, а не этим.
 */

/**
 * Связь с одной IDE: подключаемся, есть, IDE не запущена, host не установлен (IDE ещё не
 * добавила коннектор Browser), host упал - переподключаемся.
 */
export type LinkState = 'connecting' | 'connected' | 'ide-offline' | 'host-missing' | 'host-error'

export type LinkView = {
  channel: HostChannel
  state: LinkState
  ideVersion: string | null
  sessions: SessionSummary[]
}

/**
 * Профиль этой установки расширения. named - имя дал человек, иначе оно по умолчанию. launch -
 * метка запуска Chrome: новая на каждом старте браузера, она входит в ссылку на вкладку (id
 * вкладок после перезапуска раздаются заново).
 */
export type ProfileInfo = {
  key: string
  name: string
  named: boolean
  browser: string
  launch: string
}

export type PopupState = {
  profile: ProfileInfo
  links: LinkView[]
  /** Вкладка, над которой открыто окно значка: её ссылку можно скопировать. */
  tab: { id: number; title: string } | null
}

export type PopupRequest =
  /** retry - окно только что открыли: попробовать связи, которых не было (раз, а не на каждую перерисовку). */
  | { type: 'popup:state'; retry?: boolean }
  | { type: 'popup:rename'; name: string }
  | { type: 'popup:stop'; channel: HostChannel; sessionId: string }
  | { type: 'popup:copy'; tabId: number }

/** Сервис-воркер → открытое окно значка: состояние поменялось, перечитай. */
export type PopupChanged = { type: 'popup:changed' }

export type OffscreenCopy = { target: 'offscreen'; type: 'copy'; text: string }

/** Сервис-воркер → курсор и рамка в странице. */
export type OverlayCommand =
  | {
      type: 'aw-overlay'
      op: 'frame'
      on: boolean
      /**
       * Где мышь агента во вкладке: новая страница после перехода показывает курсор сразу там,
       * а не прячет его до следующего движения - настоящая мышь с переходом не исчезает.
       */
      cursor?: { x: number; y: number } | undefined
    }
  | {
      type: 'aw-overlay'
      op: 'cursor'
      x: number
      y: number
      action: 'move' | 'click' | 'double' | 'right'
      /** Путь мыши [x, y, мс от начала] и его время; нет - курсор едет по прямой. */
      path?: [number, number, number][] | undefined
      duration?: number | undefined
    }

export const isPopupRequest = (value: unknown): value is PopupRequest =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { type?: unknown }).type === 'string' &&
  (value as { type: string }).type.startsWith('popup:') &&
  (value as { type: string }).type !== 'popup:changed'
