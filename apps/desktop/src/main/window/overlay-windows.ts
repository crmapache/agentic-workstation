import { BrowserWindow } from 'electron'

/**
 * Накладные окна IDE поверх чужих приложений (капсула Computer, ADR 0057) - не окна IDE: им
 * не рассылаются события окна, они не держат IDE открытой и не ждут сохранения перед выходом.
 */
const overlays = new WeakSet<BrowserWindow>()

export const markOverlay = (window: BrowserWindow): void => {
  overlays.add(window)
}

/** Живые окна IDE без накладных. */
export const ideWindows = (): BrowserWindow[] =>
  BrowserWindow.getAllWindows().filter((window) => !window.isDestroyed() && !overlays.has(window))
