import { createHash, randomBytes } from 'node:crypto'

/** Случайная строка для state и проверочного кода PKCE: 32 байта, base64url. */
export const randomToken = (): string => randomBytes(32).toString('base64url')

/** Пара PKCE (RFC 7636, S256): проверочный код остаётся у IDE, вызов уходит в браузер. */
export const pkcePair = (): { verifier: string; challenge: string } => {
  const verifier = randomToken()

  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') }
}
