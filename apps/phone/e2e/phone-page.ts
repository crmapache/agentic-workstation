import { join } from 'node:path'

import type { Page } from 'playwright-core'

import type { FeedItem } from '@shared/claude-feed'

/**
 * Страница телефона в мобильном Chromium для сквозной проверки: лента с разным содержимым,
 * картинки с камеры и скриншоты, снимки экранов и замеры рамок - чтобы ровность рядов
 * проверялась числом, а не на глаз.
 */

export const SHOTS = join(import.meta.dirname, '..', '..', '..', '.screenshots')

export const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'

export const VIEWPORT = { width: 390, height: 844 }

export const richFeed: FeedItem[] = [
  {
    id: 't1',
    kind: 'thinking',
    text: 'The login form posts to the wrong endpoint.',
    streaming: false,
    tokens: 220,
    parentToolUseId: null,
  },
  {
    id: 'tool-1',
    kind: 'tool',
    name: 'Bash',
    input: { command: 'pnpm test -- login', description: 'Run the login tests' },
    status: 'done',
    result: { text: '12 passed, 1 failed', isError: false, truncated: false },
    startedAt: 1,
    endedAt: 2,
    closedReason: null,
    parentToolUseId: null,
  },
  {
    id: 'tool-2',
    kind: 'tool',
    name: 'Edit',
    input: { file_path: '/Users/someone/Projects/secret-client/src/auth/login.ts' },
    status: 'done',
    result: {
      text: 'ok',
      isError: false,
      truncated: false,
      changeCounts: { added: 4, removed: 2 },
    },
    startedAt: 2,
    endedAt: 3,
    closedReason: null,
    parentToolUseId: null,
  },
  {
    id: 'a-rich',
    kind: 'assistant',
    text: 'Fixed the endpoint in `login.ts`:\n\n```ts\nconst url = `${api}/v2/login`\n```\n\n- tests pass\n- **no** other changes',
    streaming: false,
    parentToolUseId: null,
  },
  {
    id: 'turn-1',
    kind: 'turn',
    durationMs: 81_000,
    costUsd: 0.12,
    isError: false,
    interrupted: false,
    changes: [
      {
        path: '/x/login.ts',
        added: 4,
        removed: 2,
        created: false,
        counted: true,
        undoable: true,
        reverted: false,
        refusal: null,
      },
    ],
    revertable: true,
    parentToolUseId: null,
  },
]

/** Рамка элемента: верх, низ, середина и высота. */
export type Box = { top: number; bottom: number; middle: number; height: number }

/** Рамка первого элемента по селектору (или его родителя - ряд, в котором он стоит). */
export const boxOf = async (page: Page, selector: string, parent = false): Promise<Box> =>
  page
    .locator(selector)
    .first()
    .evaluate((element, up) => {
      const box = ((up ? element.parentElement : element) ?? element).getBoundingClientRect()

      return {
        top: box.top,
        bottom: box.bottom,
        middle: box.top + box.height / 2,
        height: box.height,
      }
    }, parent)

/** Снимок экрана в .screenshots/phone-<name>.png - после того, как улеглась перерисовка. */
export const shotOf = (page: Page) => async (name: string) => {
  await page.waitForTimeout(150)
  await page.screenshot({ path: join(SHOTS, `phone-${name}.png`) })
}

/**
 * Фото с камеры как оно есть: JPEG, нарисованный самим Chromium, и сегмент APP1 с EXIF сразу за
 * началом файла - там, где камера пишет место съёмки.
 */
export const jpegWithExif = async (page: Page): Promise<Buffer> => {
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas')

    canvas.width = 64
    canvas.height = 48
    canvas.getContext('2d')?.fillRect(8, 8, 32, 24)

    return canvas.toDataURL('image/jpeg', 0.9)
  })
  const jpeg = Buffer.from(dataUrl.split(',')[1] ?? '', 'base64')
  const exif = Buffer.concat([
    Buffer.from('Exif\0\0MM\0*\0\0\0\x08', 'latin1'),
    Buffer.from('GPSLatitude 9.9281 N, GPSLongitude 84.0907 W, SECRET-PLACE'),
  ])
  const segment = Buffer.alloc(4)

  segment.writeUInt16BE(0xffe1, 0)
  segment.writeUInt16BE(exif.length + 2, 2)

  return Buffer.concat([jpeg.subarray(0, 2), segment, exif, jpeg.subarray(2)])
}

/**
 * Скриншот, который человек приложил к сообщению: целиком - PNG тяжелее кадра (шум внизу не
 * сжимается), уменьшенный - JPEG, каким его отдала бы IDE, и миниатюра ленты.
 */
export const screenshotPictures = (page: Page) =>
  page.evaluate(() => {
    const draw = (width: number, height: number, type: string, quality?: number) => {
      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d')

      canvas.width = width
      canvas.height = height

      if (!context) return ''

      const scale = width / 1200

      context.fillStyle = '#1b1c20'
      context.fillRect(0, 0, width, height)
      context.fillStyle = '#2b2d33'
      context.fillRect(0, 0, width, 90 * scale)
      context.fillStyle = '#d9622f'
      context.fillRect(60 * scale, 160 * scale, 420 * scale, 260 * scale)
      context.fillStyle = '#86b137'
      context.fillRect(540 * scale, 160 * scale, 600 * scale, 120 * scale)
      context.fillStyle = '#e8e8ea'
      context.font = `${Math.round(56 * scale)}px sans-serif`
      context.fillText('Login form - wrong endpoint', 60 * scale, 520 * scale)

      const noise = context.createImageData(width, Math.round(140 * scale))

      for (let index = 0; index < noise.data.length; index += 1) {
        noise.data[index] = index % 4 === 3 ? 255 : Math.floor(Math.random() * 256)
      }

      context.putImageData(noise, 0, height - noise.height)

      return canvas.toDataURL(type, quality)
    }

    return {
      full: draw(1200, 800, 'image/png'),
      reduced: draw(800, 533, 'image/jpeg', 0.75),
      thumbnail: draw(240, 160, 'image/jpeg', 0.8),
    }
  })
