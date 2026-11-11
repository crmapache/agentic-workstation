/** Кто держит вход Google: коннектор, чей это аккаунт и какому клиенту выдан токен. */
export type GrantHolder = { id: string; account: string | null; clientId: string | null }

const sameAccount = (a: string | null, b: string | null): boolean =>
  a === null || b === null || a.toLowerCase() === b.toLowerCase()

/**
 * Делит ли коннектор разрешение Google с соседом. Google держит одно разрешение на пару
 * «аккаунт + клиент» (а include_granted_scopes сливает права Gmail и Calendar), и отзыв
 * токена одного снимает вход у всех. Аккаунт неизвестен - считаем, что делит: лучше
 * оставить токен у Google, чем выбить соседний вход.
 */
export const sharesGoogleGrant = (me: GrantHolder, holders: readonly GrantHolder[]): boolean =>
  me.clientId !== null &&
  holders.some(
    (other) =>
      other.id !== me.id &&
      other.clientId === me.clientId &&
      sameAccount(other.account, me.account),
  )
