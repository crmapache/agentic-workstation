// Хук electron-builder (часть afterPack): в собранном приложении есть нативный модуль koffi своей
// системы и процессора.
//
// koffi (ADR 0008, 0058) везёт бинарник каждой системы отдельным пакетом
// @koromix/koffi-<система>-<процессор>, а pnpm ставит только пакеты своей машины - чужие лишь при
// supportedArchitectures в pnpm-workspace.yaml. Без пакета сборка Windows выходила рабочей с
// виду, а Computer Use на Windows падал на первом действии («Cannot find the native Koffi
// module») - так ушли выпуски 0.1.x. И node_modules, поставленные до этой настройки, pnpm не
// доставляет сам. Проверка роняет такую сборку.

const fs = require('node:fs')
const path = require('node:path')

// Arch из electron-builder: ia32, x64, armv7l, arm64, universal.
const ARCH_NAMES = ['ia32', 'x64', 'armv7l', 'arm64']

const resourcesOf = ({ appOutDir, electronPlatformName, packager }) =>
  electronPlatformName === 'darwin'
    ? path.join(appOutDir, `${packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
    : path.join(appOutDir, 'resources')

module.exports = function checkNative(context) {
  const platform = context.electronPlatformName
  const arch = ARCH_NAMES[context.arch]

  // universal (мак под оба процессора) не собирается (electron-builder.yml): проверять нечего.
  if (!arch) return

  const binary = path.join(
    resourcesOf(context),
    'app.asar.unpacked',
    'node_modules',
    '@koromix',
    `koffi-${platform}-${arch}`,
    `${platform}_${arch}`,
    'koffi.node',
  )

  if (!fs.existsSync(binary)) {
    throw new Error(
      `В сборке нет нативного модуля koffi для ${platform}-${arch} (${binary}). ` +
        'Проверь supportedArchitectures в pnpm-workspace.yaml и переставь зависимости: ' +
        'pnpm install --force.',
    )
  }
}
