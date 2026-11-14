/** Сборка Windows 10 2004: с неё окно можно исключить из захвата экрана (WDA_EXCLUDEFROMCAPTURE). */
const EXCLUDE_FROM_CAPTURE_BUILD = 19041

/**
 * Попадает ли капсула в снимок, несмотря на защиту содержимого. На маке и на Windows 10 2004 и
 * новее - нет. Старее (1809, 1909, LTSC 2019) Electron ставит WDA_MONITOR, и капсула выходит на
 * снимке чёрным прямоугольником - модель приняла бы его за часть приложения. release - os.release().
 */
export const isCapsuleInShots = (isWindows: boolean, release: string): boolean => {
  if (!isWindows) return false

  const build = Number(release.split('.')[2])

  return Number.isFinite(build) && build < EXCLUDE_FROM_CAPTURE_BUILD
}
