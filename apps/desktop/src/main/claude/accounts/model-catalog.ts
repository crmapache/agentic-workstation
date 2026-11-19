import type { ModelInfo } from '@shared/conversation'

import { modelKey, sameModel } from '../panel/model-watch'

/**
 * Каталог моделей аккаунта и модель, с которой поднимать процесс (StartingChoice.clamp и
 * ClaudeAccounts.canRun в ACC). CLI НЕ отказывает в модели, к которой у аккаунта нет
 * доступа, на старте: процесс поднимается, называет её в init и умирает на первом же
 * сообщении по HTTP 404, ни словом не называя аккаунт. Поэтому модель меняется ДО подъёма.
 * Неизвестный каталог значит «не трогать»: не спрошенный каталог - обычное состояние первых
 * секунд, и прочитанный как отказ он выбрасывал бы модель каждого разговора из истории.
 */

/** Имя «что у этого аккаунта по умолчанию» - его CLI сам ставит первым в каталоге. */
export const DEFAULT_MODEL = 'default'

/** Имена моделей каталога: чем модель запускают (opus) и во что CLI её разворачивает. */
export const catalogNames = (models: readonly ModelInfo[]): string[] =>
  models.flatMap((model) => [model.value, model.resolved ?? '']).filter(Boolean)

/** Метка окна в нижнем регистре («1m» у opus[1m]); у имени без метки - пусто. */
const markOf = (model: string): string => /\[([^\]]*)\]/.exec(model.toLowerCase())?.[1] ?? ''

/** Семья из ключа: «opus» у «opus-5.5». */
const familyOfKey = (key: string): string => key.split('-')[0] ?? key

/** Имя без метки окна: claude-opus-5[1m] - claude-opus-5. */
const unmarked = (model: string): string => model.replace(/\[[^\]]*\]$/, '')

/**
 * Держит ли каталог модель под любым её именем (ModelNames.holds в ACC): «opus» каталога и
 * «claude-opus-5» транскрипта - одна модель. Строг каталог только к метке окна и в одну
 * сторону: модель с меткой держит лишь запись с той же меткой (большое окно у аккаунта или
 * есть, или нет), а модель без метки держит и запись с меткой.
 */
export const catalogHolds = (names: readonly string[], model: string): boolean => {
  const wanted = modelKey(model)
  const mark = markOf(model)

  return names.some((name) => {
    const known = modelKey(name)
    const isSame =
      known === wanted || known === familyOfKey(wanted) || familyOfKey(known) === wanted

    return isSame && (!mark || markOf(name) === mark)
  })
}

/**
 * Может ли аккаунт эту модель: null - каталога нет. Свою модель из Settings (Custom models)
 * каталог не знает и знать не может - её добавили ровно потому, что шлюз её отдаёт, - и
 * отсутствие там не отказ.
 */
export const canRunModel = (
  names: readonly string[] | null,
  model: string,
  customModels: readonly string[],
): boolean | null => {
  if (!model) return true
  if (customModels.some((custom) => sameModel(custom, model))) return true

  return names ? catalogHolds(names, model) : null
}

/**
 * Модель для процесса на аккаунте: та, что просили, если её можно; иначе она же без метки
 * окна; иначе первая из запасных (чем аккаунт оставили, закреплённая для новых вкладок), что
 * аккаунт может; иначе его умолчание - названное, а не пропущенное: процесс с --resume без
 * --model продолжил бы на модели транскрипта, то есть ровно на отказанной. Без каталога -
 * null (флага нет). Заменяет только твёрдое «нет».
 */
export const clampModel = (
  model: string | null,
  canRun: (model: string) => boolean | null,
  fallbacks: readonly (string | null | undefined)[],
): string | null => {
  if (!model || canRun(model) !== false) return model

  const bare = unmarked(model)

  if (bare !== model && canRun(bare) !== false) return bare

  for (const fallback of fallbacks) if (fallback && canRun(fallback) !== false) return fallback

  return canRun(DEFAULT_MODEL) === true ? DEFAULT_MODEL : null
}
