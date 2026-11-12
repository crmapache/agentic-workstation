import { sign, createHash, createPrivateKey } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { stat, readFile, writeFile } from 'node:fs/promises'
import { join, dirname, resolve, basename } from 'node:path'
import { parseArgs } from 'node:util'

/**
 * Пишет latest.json - манифест релиза, по которому установленные копии IDE узнают
 * о новой версии (см. src/main/updates/update-manifest.ts). Кладёт его рядом со сборками.
 *
 *   node scripts/write-update-manifest.mjs --zip dist/agentic-workstation-mac-arm64.zip \
 *     [--win dist/agentic-workstation-win-x64.exe] --version 0.2.0 \
 *     --base-url https://github.com/<repo>/releases/download/v0.2.0 [--notes "что нового"]
 *
 * base-url - адрес, откуда будут скачиваться сами сборки. Для релиза это страница
 * загрузок конкретного тега, для проверки на своей машине - локальный сервер.
 *
 * Установщик Windows подписывается ключом выпуска (ADR 0048): Ed25519 над его sha512, закрытый
 * ключ - agentic-workstation-update-signing.pem в корне репозитория (или --key). Без ключа
 * сборку Windows в манифест не пишем: установленные копии отвергли бы её.
 */

const { values } = parseArgs({
  options: {
    zip: { type: 'string' },
    win: { type: 'string' },
    version: { type: 'string' },
    'base-url': { type: 'string' },
    notes: { type: 'string', default: '' },
    key: { type: 'string' },
  },
})

const { zip, win, version, notes } = values
const baseUrl = values['base-url']

if ((!zip && !win) || !version || !baseUrl) {
  console.error('Нужны --zip и/или --win, --version и --base-url')
  process.exit(1)
}

const sha512Of = (file) =>
  new Promise((resolveHash, reject) => {
    const hash = createHash('sha512')

    createReadStream(file)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolveHash(hash.digest('base64')))
      .on('error', reject)
  })

const assetOf = async (file) => {
  const [sha512, { size }] = await Promise.all([sha512Of(file), stat(file)])

  return { url: `${baseUrl.replace(/\/$/, '')}/${basename(file)}`, sha512, size }
}

const signingKey = async () => {
  const keyPath =
    values.key ?? resolve(import.meta.dirname, '../../../agentic-workstation-update-signing.pem')

  try {
    return createPrivateKey(await readFile(keyPath, 'utf8'))
  } catch {
    console.error(`Нет ключа подписи обновлений: ${keyPath} (docs/code-signing.md)`)
    process.exit(1)
  }
}

const assets = {}

if (zip) assets['mac-arm64'] = await assetOf(zip)

/**
 * Подписанная строка - как signedText в src/main/updates/win-update.ts: назначение, сборка,
 * версия, sha512, размер. Поменять одно без другого нельзя - копии отвергнут обновление.
 */
const signedText = (asset) =>
  ['agentic-workstation-update', 'win-x64', version, asset.sha512, String(asset.size)].join('\n')

if (win) {
  const asset = await assetOf(win)

  asset.signature = sign(null, Buffer.from(signedText(asset)), await signingKey()).toString(
    'base64',
  )
  assets['win-x64'] = asset
}

const manifest = { version, notes, releasedAt: new Date().toISOString(), assets }
const output = join(dirname(zip ?? win), 'latest.json')

await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`)
console.log(output)
