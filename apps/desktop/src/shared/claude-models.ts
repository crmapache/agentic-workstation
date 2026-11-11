/**
 * Имена моделей Claude - одни на всю IDE: панель Claude Code (чип MODEL, иконка в меню, судьба
 * выбора) и статистика (цена и рейтинг моделей). Одна и та же модель приходит под разными
 * именами (выбор «opus[1m]», развёрнутое «claude-opus-5[1m]», подпись ответа «claude-opus-5-5»,
 * старое «claude-3-5-haiku-20241022»), и разбирать их по-разному в двух местах значило бы
 * называть одну модель двумя именами.
 */

/**
 * Семьи моделей от длинного имени к короткому: семья ищется подстрокой, и opusplan (режим CLI:
 * план - Opus, работа - Sonnet) должен найтись раньше opus.
 */
export const CLAUDE_MODEL_FAMILIES = [
  'fable',
  'mythos',
  'opusplan',
  'opus',
  'sonnet',
  'haiku',
] as const

export type ClaudeModelFamily = (typeof CLAUDE_MODEL_FAMILIES)[number]

/**
 * Семьи, которые знает панель Claude Code: у каждой есть иконка и место в порядке меню. Модель
 * другой семьи панель называет полным идентификатором, как модель шлюза.
 */
export type PanelModelFamily = Exclude<ClaudeModelFamily, 'mythos'>

export const PANEL_MODEL_FAMILIES: readonly PanelModelFamily[] = CLAUDE_MODEL_FAMILIES.filter(
  (family): family is PanelModelFamily => family !== 'mythos',
)

/** Без регистра и метки окна: «claude-opus-5[1m]» - «claude-opus-5». */
export const bareModelId = (model: string): string => model.toLowerCase().replace(/\[.*\]$/, '')

/**
 * Семья по любому имени модели («opus», «claude-opus-4-8», «Sonnet[1m]») из списка, который знает
 * вызывающий. Своя модель через прокси и модель чужого провайдера семьи не имеют - undefined.
 */
export const modelFamilyOf = <Family extends ClaudeModelFamily>(
  model: string,
  families: readonly Family[],
): Family | undefined => {
  const bare = bareModelId(model)

  return families.find((family) => bare.includes(family))
}

/**
 * Поколение модели: «claude-opus-4-8» - «4.8», «claude-3-5-haiku-20241022» - «3.5». Дата сборки
 * на конце - длинное число, в поколение не входит; нет номера - пусто.
 */
export const modelVersionOf = (model: string): string =>
  bareModelId(model)
    .split('-')
    .filter((part) => /^\d+$/.test(part) && part.length < 5)
    .join('.')

/**
 * Имя модели для людей: «claude-opus-4-5-20251101» - «Opus 4.5», «claude-opus-5[1m]» - «Opus 5
 * 1M». Семью даёт вызывающий - своим списком (modelFamilyOf) или уже известную; без семьи
 * модель называется идентификатором как есть.
 */
export const modelLabelOf = (model: string, family: ClaudeModelFamily | undefined): string => {
  if (!family) return model

  const version = modelVersionOf(model)
  const name = family.charAt(0).toUpperCase() + family.slice(1)
  const wide = /\[1m\]$/i.test(model) ? ' 1M' : ''

  return `${name}${version ? ` ${version}` : ''}${wide}`
}
