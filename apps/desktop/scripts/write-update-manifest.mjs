import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { stat, writeFile } from 'node:fs/promises'
import { join, dirname, basename } from 'node:path'
import { parseArgs } from 'node:util'

/**
 * Пишет latest.json - манифест релиза, по которому установленные копии IDE узнают
 * о новой версии (см. src/main/updates/update-manifest.ts). Кладёт его рядом с zip.
 *
 *   node scripts/write-update-manifest.mjs --zip dist/agentic-workstation-mac-arm64.zip \
 *     --version 0.2.0 --base-url https://github.com/<repo>/releases/download/v0.2.0 \
 *     [--notes "что нового"]
 *
 * base-url - адрес, откуда будет скачиваться сам zip. Для релиза это страница
 * загрузок конкретного тега, для проверки на своей машине - локальный сервер.
 */

const { values } = parseArgs({
  options: {
    zip: { type: 'string' },
    version: { type: 'string' },
    'base-url': { type: 'string' },
    notes: { type: 'string', default: '' },
  },
})

const { zip, version, notes } = values
const baseUrl = values['base-url']

if (!zip || !version || !baseUrl) {
  console.error('Нужны --zip, --version и --base-url')
  process.exit(1)
}

const sha512 = await new Promise((resolve, reject) => {
  const hash = createHash('sha512')

  createReadStream(zip)
    .on('data', (chunk) => hash.update(chunk))
    .on('end', () => resolve(hash.digest('base64')))
    .on('error', reject)
})

const { size } = await stat(zip)
const manifest = {
  version,
  notes,
  releasedAt: new Date().toISOString(),
  assets: {
    'mac-arm64': { url: `${baseUrl.replace(/\/$/, '')}/${basename(zip)}`, sha512, size },
  },
}
const output = join(dirname(zip), 'latest.json')

await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`)
console.log(output)
