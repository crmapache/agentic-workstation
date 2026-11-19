import type { RevealOptions } from 'smooth-stream-text/react'

/**
 * Длиннее этого ответ встаёт без волны: так много текста приходит только готовым
 * куском (сводка после сжатия, файл в ответе), и десятки тысяч анимаций разом
 * замораживали бы панель (ACC).
 */
export const REVEAL_LIMIT = 12_000

/**
 * Волна по символу, как в ACC: шаг между соседями короткий - поток приходит уже
 * выровненным, и длинная пауза копила бы очередь; без сдвига по вертикали строка не
 * дрожит переносами. Длительность и размытие - токены дизайн-системы (читает хук).
 */
export const REVEAL_PACE: RevealOptions = {
  unit: 'char',
  staggerMs: 14,
  translatePx: 0,
  maxWaveLagMs: 140,
  easing: 'var(--easing-out)',
}

/** Токены волны в tokens.css: длительность одного символа и стартовое размытие. */
export const REVEAL_DURATION_TOKEN = '--duration-reveal'
export const REVEAL_BLUR_TOKEN = '--blur-reveal'
