/**
 * Длинная сторона миниатюры в ленте, px. Картинка на ретине рисуется вдвое мельче,
 * так что 320 - это чёткие 160 точек в плашке сообщения.
 */
export const THUMBNAIL_EDGE = 320

/** Качество JPEG миниатюры: около 20 КБ на скриншот. */
export const THUMBNAIL_QUALITY = 80

/**
 * Превью картинки под курсором (как в ACC): больше FIT_ABOVE_BYTES уменьшается до
 * PREVIEW_EDGE по длинной стороне - иначе мегабайты скриншота ехали бы в окно на каждое
 * наведение. Что Electron не разжимает, едет целиком до RAW_MAX_BYTES, дальше превью нет.
 */
export const PREVIEW_EDGE = 1200
export const FIT_ABOVE_BYTES = 1.5 * 1024 * 1024
export const RAW_MAX_BYTES = 12 * 1024 * 1024

/** Потолок файла, который читается ради картинки: путь пришёл из чипа сообщения. */
export const PICTURE_FILE_MAX_BYTES = 30 * 1024 * 1024

/** Качество JPEG уменьшенной копии: текст на скриншоте остаётся читаемым. */
export const PREVIEW_QUALITY = 85

/** Расширения картинок: такой файл - чип картинки, а не файла. */
export const PICTURE_EXTENSIONS: ReadonlySet<string> = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'bmp',
  'svg',
])
