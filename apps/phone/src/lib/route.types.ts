import type { Route } from './routes'

/** Адрес экрана своего вида: экран получает разобранные части адреса пропсом. */
export type RouteOf<N extends Route['name']> = Extract<Route, { name: N }>
