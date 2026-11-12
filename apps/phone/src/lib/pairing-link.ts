import type { PairingCode } from '@agentic-workstation/remote-protocol/pairing-url'
import {
  PAIRING_PATH,
  parsePairingFragment,
} from '@agentic-workstation/remote-protocol/pairing-url'

/** Код из адреса: прочитан, испорчен (invalid) или его не было. */
export type TakenCode = { kind: 'code'; code: PairingCode } | { kind: 'invalid' } | { kind: 'none' }

type Place = { pathname: string; search: string; hash: string }

type History = {
  state: unknown
  replaceState: (state: unknown, unused: string, url: string) => void
}

/**
 * Забрать код пары из фрагмента адреса и сразу стереть его - и из адресной строки, и из
 * истории (запись заменяется, а не добавляется): секрет не должен остаться ни в «назад», ни в
 * закладке, ни в общем доступе к вкладке. Код остаётся только в памяти страницы.
 */
export const takePairingCode = (place: Place, history: History): TakenCode => {
  if (!place.hash || place.hash === '#') return { kind: 'none' }

  const code = parsePairingFragment(place.hash)
  // Фрагмент стирается в любом случае: и кривой код - тоже чей-то секрет.
  const path = code || place.pathname === PAIRING_PATH ? PAIRING_PATH : place.pathname

  history.replaceState(history.state, '', `${path}${place.search}`)

  return code
    ? { kind: 'code', code }
    : place.pathname === PAIRING_PATH
      ? { kind: 'invalid' }
      : { kind: 'none' }
}

/**
 * Код из вставленного адреса пары. Нужен приложению с экрана «Домой» на iPhone: у него своё
 * хранилище, отдельное от Safari, а камера открывает QR в Safari - пара оттуда в приложение не
 * попадает, и уведомления (они есть только у приложения) включить было бы не у чего. Адрес
 * копируют в камере (долгое нажатие на ссылку QR) и вставляют здесь. Только адрес пары этого
 * же релея: пара идёт через релей страницы, с чужого IDE не услышит.
 */
export const codeFromLink = (text: string, origin: string): TakenCode => {
  try {
    const url = new URL(text.trim())
    const code =
      url.origin === origin && url.pathname === PAIRING_PATH ? parsePairingFragment(url.hash) : null

    return code ? { kind: 'code', code } : { kind: 'invalid' }
  } catch {
    return { kind: 'invalid' }
  }
}
