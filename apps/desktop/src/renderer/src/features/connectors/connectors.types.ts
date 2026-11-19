import type { ConnectorKind } from '@shared/connectors'

/** Что добавляют: коннектор этого типа или перенос из Claude Code. */
/** Тип из каталога нового: встроенные (уведомления IDE, сама IDE - ADR 0069, 0090) IDE заводит сама. */
export type AddKind = Exclude<ConnectorKind, 'notifications' | 'workstation' | 'extensions'>

/** Что добавляют: тип из каталога или перенос. */
export type AddTarget = AddKind | 'import'

/**
 * Окно на виде Connectors: подробности коннектора, добавление нового, свой тип из каталога -
 * ещё одно его подключение, или работа ИИ над новым коннектором (ADR 0050).
 */
export type ConnectorsPanel =
  | { kind: 'connector'; id: string }
  | { kind: 'add'; target: AddTarget }
  | { kind: 'type'; id: string }
  | { kind: 'aiJob'; id: string }
