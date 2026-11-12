// Хук electron-builder: после того как dmg и zip собраны, сносит распакованные
// каталоги сборки (mac-arm64, win-unpacked и подобные).
//
// Дело не в месте на диске: распакованный Agentic Workstation.app внутри проекта для
// Spotlight такое же приложение, как установленное, и запустить можно не то.
// Исключить вложенную папку из индексации нечем. Терять нечего: установщики уже
// собраны из этого каталога. Если он нужен (посмотреть подпись, см.
// docs/code-signing.md) - сборка с AGENTIC_WORKSTATION_KEEP_UNPACKED=1.

const fs = require('node:fs/promises')
const path = require('node:path')

const UNPACKED_DIR = /^(mac|win)(-.+)?$/

module.exports = async function afterAllArtifactBuild({ outDir }) {
  if (process.env.AGENTIC_WORKSTATION_KEEP_UNPACKED === '1') {
    return []
  }

  const entries = await fs.readdir(outDir, { withFileTypes: true })

  for (const entry of entries) {
    if (entry.isDirectory() && UNPACKED_DIR.test(entry.name)) {
      await fs.rm(path.join(outDir, entry.name), { recursive: true, force: true })
    }
  }

  // Пустой список: хук ничего не добавляет к артефактам.
  return []
}
