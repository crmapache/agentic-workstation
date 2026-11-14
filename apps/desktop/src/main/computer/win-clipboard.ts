import type { Motion } from '../browser/human-motion'
import {
  PASTE_LATE_MS,
  PASTE_POLL_MS,
  PASTE_TAKE_MS,
  CLIP_OPEN_TRIES,
  PASTE_SETTLE_MS,
  CLIP_OPEN_GAP_MS,
  CLIP_RESTORE_TRIES,
  PASTE_FOCUS_WAIT_MS,
  CLIP_SAVED_MAX_BYTES,
} from './computer.constants'
import type { PasteSession, TextClipboard } from './computer.types'
import { loadClipNative } from './win-clipboard-native'
import type { ClipHandle, ClipNative } from './win-clipboard-native'

const CF_UNICODETEXT = 13
const GMEM_MOVEABLE = 0x0002
const WM_RENDERFORMAT = 0x0305
const WM_RENDERALLFORMATS = 0x0306
const WM_DESTROYCLIPBOARD = 0x0307

/**
 * Пометки, по которым история буфера Windows (Win+V), облачный буфер и программы-менеджеры буфера
 * не берут текст себе: он у агента временный, человек его не копировал.
 */
const PRIVATE_FORMATS = [
  'ExcludeClipboardContentFromMonitorProcessing',
  'CanIncludeInClipboardHistory',
  'CanUploadToCloudClipboard',
]

/**
 * Форматы, данные которых не память, а дескриптор GDI (картинка, метафайл, палитра) или частный:
 * скопировать их байтами нельзя. Картинку Windows сама строит заново из DIB, который сохраняется.
 */
const isHandleFormat = (format: number) =>
  [2, 3, 9, 14, 0x80, 0x82, 0x83, 0x8e].includes(format) || (format >= 0x200 && format <= 0x3ff)

type Saved = { format: number; bytes: Uint8Array }

/** Текст, который предложен приложению, и забран ли он. */
type Offer = { text: string; isTaken: boolean }

/** Строка в UTF-16 с нулём на конце - так Windows хранит CF_UNICODETEXT. */
const utf16z = (text: string): Uint8Array => {
  const bytes = new Uint8Array((text.length + 1) * 2)

  for (let index = 0; index < text.length; index += 1) {
    const unit = text.charCodeAt(index)

    bytes[index * 2] = unit & 0xff
    bytes[index * 2 + 1] = unit >> 8
  }

  return bytes
}

/**
 * Буфер обмена Windows для текста руки (ADR 0058). Набор знаками Windows доставляет занятому
 * приложению вперемешку, а вставку - целиком и сразу. Буфер человека запоминается со всеми
 * форматами и возвращается после набора. Текст кладётся отложенно (delayed rendering): Windows
 * просит его у окна IDE, когда приложение вставляет, - так рука знает, что вставка принята, и
 * не путает «не принял» с «ещё не успел».
 */
export const createWinClipboard = (lib: () => ClipNative, motion: Motion): TextClipboard => {
  let window: ClipHandle = null
  let offer: Offer | null = null

  const native = () => lib()

  /** Окно-владелец: отдаёт отложенный текст и узнаёт, что буфер ушёл к другому. */
  const onMessage = (message: number, format: number): boolean => {
    if (message === WM_RENDERFORMAT) {
      if (format === CF_UNICODETEXT && offer) {
        put(CF_UNICODETEXT, utf16z(offer.text))
        offer.isTaken = true
      }

      return true
    }

    // IDE закрывается, а текст ещё не отдан: Windows просит всё сразу, буфер открывать самим.
    if (message === WM_RENDERALLFORMATS) {
      if (offer && native().openClipboard(window)) {
        put(CF_UNICODETEXT, utf16z(offer.text))
        native().closeClipboard()
      }

      return true
    }

    if (message === WM_DESTROYCLIPBOARD) return true

    return false
  }

  const owner = () => (window ??= native().createWindow(onMessage))

  /** Положить байты в буфер (он уже открыт). Не взял - память освобождается здесь. */
  const put = (format: number, bytes: Uint8Array) => {
    const lib = native()
    const memory = lib.globalAlloc(GMEM_MOVEABLE, Math.max(bytes.length, 1))

    if (!memory) return

    const pointer = lib.globalLock(memory)

    if (pointer) lib.write(pointer, bytes)

    lib.globalUnlock(memory)

    if (!pointer || !lib.setClipboardData(format, memory)) lib.globalFree(memory)
  }

  /** Открыть буфер: его может держать другое приложение - подождать, но недолго. */
  const open = async (tries = CLIP_OPEN_TRIES): Promise<boolean> => {
    for (let attempt = 0; attempt < tries; attempt += 1) {
      if (native().openClipboard(owner())) return true

      await motion.sleep(CLIP_OPEN_GAP_MS)
    }

    return false
  }

  /** Всё, что сейчас в буфере человека; null - не вышло или слишком велико, чтобы держать. */
  const save = async (): Promise<Saved[] | null> => {
    if (!(await open())) return null

    const lib = native()

    try {
      const saved: Saved[] = []
      let total = 0

      for (
        let format = lib.enumClipboardFormats(0);
        format;
        format = lib.enumClipboardFormats(format)
      ) {
        if (isHandleFormat(format)) continue

        // Отложенный формат, который его приложение уже не отдаст: у человека его тоже нет.
        const memory = lib.getClipboardData(format)

        if (!memory) continue

        const size = lib.globalSize(memory)

        total += size

        if (total > CLIP_SAVED_MAX_BYTES) return null

        const pointer = lib.globalLock(memory)

        if (!pointer) continue

        try {
          saved.push({ format, bytes: lib.read(pointer, size) })
        } finally {
          lib.globalUnlock(memory)
        }
      }

      return saved
    } finally {
      lib.closeClipboard()
    }
  }

  return {
    open: async (): Promise<PasteSession | null> => {
      const saved = await save()

      if (!saved) return null

      let isTouched = false
      let lastTaken = 0

      return {
        offer: async (text) => {
          if (!(await open())) return false

          const lib = native()

          try {
            if (!lib.emptyClipboard()) return false

            // Без данных - отложенно: Windows попросит текст у окна IDE в момент вставки.
            lib.setClipboardData(CF_UNICODETEXT, null)

            for (const name of PRIVATE_FORMATS) put(lib.registerFormat(name), new Uint8Array(4))

            offer = { text, isTaken: false }
            isTouched = true

            return true
          } finally {
            lib.closeClipboard()
          }
        },
        taken: async (signal) => {
          const current = offer
          const started = motion.now()

          if (!current) return false

          while (!current.isTaken && motion.now() - started < PASTE_TAKE_MS) {
            await motion.sleep(PASTE_POLL_MS, signal)
          }

          // Не взяло вовремя: занято или не умеет вставлять. Занятое дождаться - иначе вставка
          // придёт позже, когда в буфере снова текст человека.
          if (!current.isTaken) {
            await native().focusResponds(PASTE_FOCUS_WAIT_MS)
            await motion.sleep(PASTE_LATE_MS, signal)
          }

          if (current.isTaken) lastTaken = motion.now()

          return current.isTaken
        },
        close: async () => {
          if (!isTouched) return

          // Приложение могло взять текст и прочесть буфер ещё раз (другой формат) - дать ему
          // закончить, прежде чем вернуть буфер человеку.
          await motion.sleep(PASTE_SETTLE_MS - (motion.now() - lastTaken))

          // Человек за это время скопировал своё - его буфер новее запомненного. Буфер держит
          // другое приложение - ждать дольше обычного: иначе у человека остался бы текст агента.
          if (native().clipboardOwner() !== owner() || !(await open(CLIP_RESTORE_TRIES))) {
            return
          }

          const lib = native()

          try {
            lib.emptyClipboard()
            offer = null

            for (const { format, bytes } of saved) put(format, bytes)
          } finally {
            lib.closeClipboard()
          }
        },
      }
    },
  }
}

let clipNative: ClipNative | null = null

/** Буфер этого Windows: вызовы грузятся на первой вставке. */
export const createWindowsClipboard = (motion: Motion): TextClipboard =>
  createWinClipboard(() => (clipNative ??= loadClipNative()), motion)
