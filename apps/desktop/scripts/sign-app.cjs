// Часть хука electron-builder afterPack (after-pack.cjs): подписывает собранный бандл сертификатом
// проекта «Agentic Workstation Code Signing» - до того, как из бандла соберутся dmg и zip.
//
// Почему не встроенная подпись electron-builder: она ищет сертификат только среди
// доверенных (security find-identity -v), а доверие самоподписанному сертификату
// macOS выдаёт лишь через системное окно с паролем учётной записи. Самому codesign
// доверие не нужно, и подпись выходит та же: правило подписи привязано к
// сертификату, на нём держится самообновление (docs/adr/0004-self-update.md).
//
// AGENTIC_WORKSTATION_SIGN=required (так делает `pnpm dist`) - подписать обязательно, без
// сертификата сборка падает. Без переменной (`pnpm dist:local`) бандл остаётся с
// подписью ad-hoc. AGENTIC_WORKSTATION_SIGN_IDENTITY и AGENTIC_WORKSTATION_SIGN_KEYCHAIN подменяют
// сертификат и связку ключей - так подписывает одноразовым сертификатом update:e2e.

const { execFileSync } = require('node:child_process')
const path = require('node:path')

const CERT_NAME = 'Agentic Workstation Code Signing'

const findIdentity = (keychain) => {
  const args = ['find-identity', '-p', 'codesigning', ...(keychain ? [keychain] : [])]
  const output = execFileSync('security', args, { encoding: 'utf8' })
  const line = output.split('\n').find((candidate) => candidate.includes(`"${CERT_NAME}"`))

  // Строка вида «  4) AC7A...37D1 "Agentic Workstation Code Signing" (CSSMERR_TP_NOT_TRUSTED)».
  // «Не доверен» - норма: доверие подписи не нужно.
  return line ? line.trim().split(/\s+/)[1] : null
}

module.exports = async function signApp({ appOutDir, electronPlatformName, packager }) {
  if (electronPlatformName !== 'darwin' || process.env.AGENTIC_WORKSTATION_SIGN !== 'required')
    return

  const keychain = process.env.AGENTIC_WORKSTATION_SIGN_KEYCHAIN
  const identity = process.env.AGENTIC_WORKSTATION_SIGN_IDENTITY || findIdentity(keychain)

  if (!identity) {
    throw new Error(`Нет сертификата «${CERT_NAME}» в связке ключей - см. docs/code-signing.md`)
  }

  const bundle = path.join(appOutDir, `${packager.appInfo.productFilename}.app`)
  const keychainArgs = keychain ? ['--keychain', keychain] : []

  execFileSync('codesign', ['--force', '--deep', '--sign', identity, ...keychainArgs, bundle], {
    stdio: 'inherit',
  })

  // Проверка, что ушло не ad-hoc: такую сборку установленные копии не примут.
  const requirement = execFileSync('codesign', ['-d', '-r-', bundle], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })

  if (!requirement.includes('certificate leaf')) {
    throw new Error(`Бандл подписан не сертификатом: ${requirement.trim()}`)
  }
}
