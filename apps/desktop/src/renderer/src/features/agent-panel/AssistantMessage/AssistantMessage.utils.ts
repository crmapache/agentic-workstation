/** Число из значения токена («340ms», «4px»); нет или не число - 0. */
export const tokenNumber = (style: CSSStyleDeclaration, token: string): number => {
  const value = Number.parseFloat(style.getPropertyValue(token))

  return Number.isFinite(value) ? value : 0
}
