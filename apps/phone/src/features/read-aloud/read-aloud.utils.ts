import type { InventoryMessage } from '@agentic-workstation/remote-protocol/agent-messages'
import { CAP_READ } from '@agentic-workstation/remote-protocol/agent-messages'

/**
 * Может ли эта IDE читать ответы вслух сейчас (ADR 0106): умеет (caps read) и голос у неё
 * включён с ключом. IDE постарше чтения не умеет - кнопки нет, а не вечная крутилка.
 */
export const canReadAloud = (inventory: Pick<InventoryMessage, 'caps' | 'voice'> | undefined) =>
  !!inventory && inventory.caps.includes(CAP_READ) && inventory.voice?.available === true

/** Номер следующего чтения: кадры звука несут его, uint16 по кругу. */
export const nextReadingNumber = (previous: number): number => (previous + 1) & 0xffff
