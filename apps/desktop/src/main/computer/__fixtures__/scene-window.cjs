// Окно для cg-scene.integration.test.ts (ADR 0129): открывается поверх точки, как окно, которое
// человек открыл, пока ИИ ждал, и рядом - своё окно, закрытое от захвата, как капсула. Не
// забирает фокус. Пишет в stdout JSON с pid и местами окон и ждёт, пока его закроют.
const { app, BrowserWindow } = require('electron')

const show = async (bounds, isProtected) => {
  const window = new BrowserWindow({ ...bounds, show: false, focusable: !isProtected })

  if (isProtected) {
    window.setContentProtection(true)
    window.setAlwaysOnTop(true, 'floating')
  }

  await window.loadURL('data:text/html,<body style="background:#fff"></body>')
  window.showInactive()

  return window.getBounds()
}

app.whenReady().then(async () => {
  const opened = await show({ x: 60, y: 160, width: 320, height: 220 }, false)
  const hidden = await show({ x: 420, y: 160, width: 200, height: 60 }, true)

  // Оконный сервер показывает окно не в тот же миг, что showInactive.
  await new Promise((resolve) => setTimeout(resolve, 500))
  process.stdout.write(`${JSON.stringify({ pid: process.pid, opened, hidden })}\n`)
})
