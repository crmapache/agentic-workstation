import type { HostChannel } from '@agentic-workstation/browser-protocol/protocol'

import type { LinkView, LinkState } from '../common/messages'

/** Ключ строки _locales для состояния связи. */
export const LINK_TEXT: Record<LinkState, string> = {
  connecting: 'linkConnecting',
  connected: 'linkConnected',
  'ide-offline': 'linkIdeOffline',
  'host-missing': 'linkHostMissing',
  'host-error': 'linkHostError',
}

export const CHANNEL_TEXT: Record<HostChannel, string> = {
  installed: 'channelInstalled',
  dev: 'channelDev',
}

export const DOT_CLASS: Record<LinkState, string> = {
  connecting: 'dotWaiting',
  connected: 'dotConnected',
  'ide-offline': 'dotOffline',
  'host-missing': '',
  'host-error': 'dotWaiting',
}

/**
 * Какие связи показать. Host без IDE (не установлен) - обычное дело для dev у человека без
 * dev: такую строку не показывать, пока есть другая. Не установлен ни один - строка
 * установленной IDE и подсказка, как поставить.
 */
export const linkRows = (links: readonly LinkView[]): { rows: LinkView[]; missing: boolean } => {
  const present = links.filter((link) => link.state !== 'host-missing')

  if (present.length) return { rows: present, missing: false }

  return { rows: links.filter((link) => link.channel === 'installed'), missing: true }
}
