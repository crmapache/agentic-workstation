/** Агент флота по месту: карточка workflow и номер агента в прогоне. */
export type FleetAgentRef = { itemId: string; index: number }

/** Что показано на месте ленты разговора: поток агента (чип) и окно агента флота поверх. */
export type StreamSelection = { stream: string | null; fleet: FleetAgentRef | null }

/**
 * Что выбрано вместо ленты: поток агента (его вызов в ленте) или окно агента флота.
 * null - выбран main, видна сама лента.
 */
export type SelectedStream =
  { kind: 'agent'; itemId: string } | { kind: 'fleetAgent'; itemId: string; index: number }
