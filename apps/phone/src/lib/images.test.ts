import { it, expect } from 'vitest'

import { encodingOf } from './images'

/**
 * Фото уходит в IDE перерисованным на холсте всегда: так с него слетает EXIF (место съёмки,
 * модель телефона). Сама перерисовка проверяется в Chromium (e2e/phone.browser.test.ts).
 */
it('PNG - в PNG без потерь, JPEG и прочее - в JPEG, GIF - как есть', () => {
  expect(encodingOf('image/png')).toBe('image/png')
  expect(encodingOf('image/jpeg')).toBe('image/jpeg')
  expect(encodingOf('image/webp')).toBe('image/jpeg')
  expect(encodingOf('image/heic')).toBe('image/jpeg')
  expect(encodingOf('image/gif')).toBe('keep')
})
