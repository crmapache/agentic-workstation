import { PASTE_ALWAYS_FOLDS_CHARS } from '../chips.constants'

/**
 * Порог сворачивания вставки в строках (как в ACC): от двух - одна строка значила бы
 * «сворачивать всё»; до пятисот - больше уже не читают перед отправкой. «Никогда» - это
 * отдельная строка экрана, а не ноль на шкале.
 */
export const PASTE_COLLAPSE_MIN = 2
export const PASTE_COLLAPSE_MAX = 500

/** Предохранитель словами: тысячи символов, а не килобайты - считаются символы. */
export const GUARD_THOUSANDS = Math.round(PASTE_ALWAYS_FOLDS_CHARS / 1000)
