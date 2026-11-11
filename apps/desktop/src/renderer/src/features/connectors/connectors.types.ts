import type { ConnectorKind } from '@shared/connectors'

/** Что добавляют: коннектор этого типа или перенос из Claude Code. */
export type AddTarget = ConnectorKind | 'import'

/**
 * Окно на виде Connectors: подробности коннектора, добавление нового или свой тип из
 * каталога - ещё одно его подключение.
 */
export type ConnectorsPanel =
  | { kind: 'connector'; id: string }
  | { kind: 'add'; target: AddTarget }
  | { kind: 'type'; id: string }
