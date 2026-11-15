/**
 * Размер файла словами: «24.6 MB», ровные - без дроби: «20 MB». Общее для редактора
 * (файл больше потолка) и просмотра Markdown (картинка больше потолка).
 */
export const formatSize = (bytes: number): string => {
  const megabytes = bytes / 1024 / 1024

  return `${Number.isInteger(megabytes) ? megabytes : megabytes.toFixed(1)} MB`
}

/**
 * Сколько колонок кода положить в миникарту, чтобы она вышла шириной width. Ширину Monaco
 * задаёт колонками (maxColumn), а колонка - это scale / pixelRatio CSS-пикселя, и scale он на
 * экране с плотностью от 2 удваивает сам (_computeMinimapLayout в editorOptions.js). Поэтому
 * число колонок зависит от экрана: 80 на Retina и обычном мониторе, 120 при масштабе 150%.
 */
export const minimapColumns = (pixelRatio: number, width: number): number => {
  const columnWidth = (pixelRatio >= 2 ? 2 : 1) / pixelRatio
  let columns = Math.ceil(width / columnWidth)

  // Monaco округляет ширину вниз: дробь колонки в долях пикселя не должна отнять пиксель.
  while (Math.floor(columns * columnWidth) < width) columns += 1

  return columns
}
