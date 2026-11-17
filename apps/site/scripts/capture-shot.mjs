/**
 * Снимок окна IDE для сайта: копия агента (`apps/desktop/scripts/agent-window.sh`) рисуется
 * при заданном размере вьюпорта и плотности 2x, кадр пишется в PNG.
 *
 *   node apps/site/scripts/capture-shot.mjs <ширина> <высота> <файл.png>
 *
 * Electron не даёт менять размер окна через CDP (Browser.setWindowBounds у него нет), поэтому
 * размер задаёт эмуляция вьюпорта: страница раскладывается заново, как в окне такого размера,
 * и после снимка эмуляция снимается. Сайт берёт кадры 1600x1000 - в окне 1440x900 редактор
 * между деревом и панелью Claude Code слишком узкий. Как готовить сцену - apps/site/README.md.
 */
import { writeFile } from 'node:fs/promises'

const port = process.env.AGENTIC_WORKSTATION_CDP_PORT ?? '5316'
const [width, height, out] = process.argv.slice(2)

if (!width || !height || !out) {
  console.error('usage: node capture-shot.mjs <width> <height> <out.png>')
  process.exit(2)
}

const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
// Страниц у IDE две: окно и капсула Computer Use (ADR 0057). Нужно окно.
const page = targets.find((target) => target.type === 'page' && !target.url.includes('capsule'))
if (!page) throw new Error(`На порту ${port} нет окна IDE - копия запущена?`)

const socket = new WebSocket(page.webSocketDebuggerUrl)
const pending = new Map()
let lastId = 0

socket.onmessage = (event) => {
  const message = JSON.parse(event.data)
  pending.get(message.id)?.(message)
}

const call = (method, params = {}) =>
  new Promise((resolve) => {
    lastId += 1
    pending.set(lastId, resolve)
    socket.send(JSON.stringify({ id: lastId, method, params }))
  })

await new Promise((resolve) => (socket.onopen = resolve))

await call('Emulation.setDeviceMetricsOverride', {
  width: Number(width),
  height: Number(height),
  deviceScaleFactor: 2,
  mobile: false,
})
// Раскладка, Monaco и лента подстраиваются под новый размер не за один кадр.
await new Promise((resolve) => setTimeout(resolve, 1500))

const shot = await call('Page.captureScreenshot', { format: 'png' })
await writeFile(out, Buffer.from(shot.result.data, 'base64'))

await call('Emulation.clearDeviceMetricsOverride')
socket.close()
console.log(out)
