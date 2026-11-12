import { createRequire } from 'node:module'

/**
 * Версия приложения внутри собранного app.asar - проверка сборки Windows перед публикацией
 * (скилл /build): у установщика NSIS нет Info.plist, который читает plutil у мака.
 *
 *   node scripts/asar-version.mjs dist/win-unpacked/resources/app.asar
 *
 * @electron/asar - зависимость electron-builder, у самого проекта его нет: ищется по цепочке.
 */
const [asarPath] = process.argv.slice(2)

if (!asarPath) {
  console.error('Нужен путь к app.asar')
  process.exit(1)
}

const fromProject = createRequire(import.meta.url)
const fromBuilder = createRequire(fromProject.resolve('electron-builder'))
const fromLib = createRequire(fromBuilder.resolve('app-builder-lib'))
const asar = fromLib('@electron/asar')

console.log(JSON.parse(asar.extractFile(asarPath, 'package.json').toString('utf8')).version)
