/** Сборка из version_name манифеста: `0.1.0 (abc123)` → `abc123`; без неё - `dev`. */
export const buildFromVersionName = (versionName: string | undefined): string =>
  /\(([\w-]+)\)\s*$/.exec(versionName ?? '')?.[1] ?? 'dev'

/**
 * Перезагрузиться ли на новую сборку из папки. Одна попытка на сборку: если после
 * перезагрузки в папке всё ещё другая (две IDE разных версий кладут каждая свою), второй раз
 * не перезагружаемся - иначе расширение перезапускалось бы по кругу посреди работы агента.
 */
export const shouldReload = (
  own: string,
  offered: string | null,
  alreadyTried: string | null,
): boolean => Boolean(offered && offered !== own && offered !== alreadyTried)
