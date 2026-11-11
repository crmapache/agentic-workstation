/**
 * Remote Control (ADR 0041): IDE звонит на свой релей, телефон спаривается по QR и смотрит
 * проекты, разговоры провайдеров и очереди сценариев. Владелец - главный процесс
 * (main/remote), окно рисует окно Remote Control по этому виду.
 */

/**
 * Как идёт связь с релеем. Разные слова - разные лекарства: reconnecting лечится само
 * (тоннель, крышка ноутбука), relayDown - сервер нездоров, displaced - адрес этой IDE занял
 * другой компьютер (копия профиля на втором Mac): IDE пробует изредка, решает человек;
 * refused не пройдёт и через час (релей не понимает нас).
 */
export type RemoteLinkState =
  'off' | 'connecting' | 'connected' | 'reconnecting' | 'relayDown' | 'displaced' | 'refused'

/** Спаренный телефон. Имя назвал сам телефон - ему не доверяют, отпечаток сверяют глазами. */
export type RemoteDevice = {
  id: string
  label: string
  fingerprint: string
  pairedAt: number
  /** Когда телефон последний раз доказал, что это он (мс); 0 - не слышали. */
  lastSeenAt: number
  /** На связи сейчас: ключи есть и слово от него было недавно. */
  online: boolean
  /** Телефон прислал подписку на пуши: IDE будит его, когда его нет на связи. */
  notifications: boolean
}

/** Код пары на экране: адрес за QR (секрет - после #) и когда перестанет работать (мс). */
export type RemotePairing = { url: string; expiresAt: number }

/** Телефон доказал, что видел код, и ждёт Approve человека. */
export type RemotePending = { deviceId: string; label: string; fingerprint: string }

/** Всё, что рисует окно Remote Control, - каждый раз целиком. */
export type RemoteView = {
  enabled: boolean
  state: RemoteLinkState
  /** Хост релея - для подписи; адрес задан в IDE и не меняется (решение владельца). */
  relayHost: string
  /** Отпечаток ключа этой IDE: телефон показывает его при паре. Пусто - ключа ещё нет. */
  fingerprint: string
  /** false - ключам негде храниться (нет системного шифрования): пара не переживёт перезапуск. */
  keysKept: boolean
  devices: RemoteDevice[]
  pairing: RemotePairing | null
  pending: RemotePending | null
}
