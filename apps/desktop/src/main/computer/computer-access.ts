import { shell, desktopCapturer, systemPreferences } from 'electron'

import type { ComputerState, ComputerPermission } from '@shared/computer'

import { IS_MAC, IS_WINDOWS } from '../platform'
import { ComputerError } from './computer-error'
import { SCREEN_SETTINGS_URL, ACCESSIBILITY_SETTINGS_URL } from './computer.constants'

/**
 * Разрешения для Computer. На маке их два: «Универсальный доступ» пускает события мыши и
 * клавиатуры в чужие приложения (без него система их молча выбрасывает), «Запись экрана» -
 * снимки; выдаёт их только человек в Системных настройках. Windows не спрашивает ничего (ADR
 * 0058). Других систем у IDE нет, но и там Computer честно скажет, что не работает.
 */
export const readComputerState = (): ComputerState => {
  if (IS_MAC) {
    return {
      supported: true,
      needsPermissions: true,
      accessibility: systemPreferences.isTrustedAccessibilityClient(false),
      screen: systemPreferences.getMediaAccessStatus('screen') === 'granted',
    }
  }

  return {
    supported: IS_WINDOWS,
    needsPermissions: false,
    accessibility: IS_WINDOWS,
    screen: IS_WINDOWS,
  }
}

/**
 * Попросить разрешение: первый запрос macOS ставит IDE в список настройки (и показывает своё
 * окно), потом открывается сама настройка - там человек включает переключатель.
 */
export const askComputerPermission = async (permission: ComputerPermission): Promise<boolean> => {
  if (!IS_MAC) return false

  if (permission === 'accessibility') {
    systemPreferences.isTrustedAccessibilityClient(true)
  } else {
    await desktopCapturer
      .getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } })
      .catch(() => [])
  }

  await shell.openExternal(
    permission === 'accessibility' ? ACCESSIBILITY_SETTINGS_URL : SCREEN_SETTINGS_URL,
  )

  return true
}

const MISSING: Record<ComputerPermission, string> = {
  accessibility: 'Accessibility (to move the mouse and type)',
  screen: 'Screen Recording (to see the screen)',
}

/** Перед действием: чего не хватает - модель узнаёт текстом, что попросить у человека. */
export const assertComputerAccess = (state: ComputerState, needs: ComputerPermission[]): void => {
  if (!state.supported) {
    throw new ComputerError('no-access', 'Computer Use works on macOS and Windows only.')
  }

  const missing = needs.filter((permission) => !state[permission])

  if (missing.length === 0) return

  throw new ComputerError(
    'no-access',
    `The IDE has no macOS permission for ${missing.map((one) => MISSING[one]).join(' and ')}. ` +
      'Ask the user to allow it in Agentic Workstation → Connectors → Computer Use; macOS may ' +
      'want the IDE reopened after that.',
  )
}
