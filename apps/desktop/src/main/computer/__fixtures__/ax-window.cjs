// Окно для ax-element.integration.test.ts (ADR 0119): полоса «Aceptar | Rechazar» с включённой
// доступностью и над «Aceptar» - прозрачное окно, сквозь которое проходят клики, как стрелка ИИ
// (computer-pointer-window.ts). Пишет в stdout JSON с точками экрана и ждёт, пока его закроют.
const { app, BrowserWindow } = require('electron')

const PAGE = `<body style="margin:0;background:#fff">
<button style="position:absolute;left:20px;top:20px;width:120px;height:60px">Aceptar</button>
<button style="position:absolute;left:150px;top:20px;width:120px;height:60px">Rechazar</button>
<p style="position:absolute;left:20px;top:110px;margin:0">Plain text</p></body>`

app.whenReady().then(async () => {
  app.setAccessibilitySupportEnabled(true)

  const window = new BrowserWindow({ x: 40, y: 120, width: 300, height: 200, show: false })

  window.setAlwaysOnTop(true, 'floating')
  await window.loadURL(`data:text/html,${encodeURIComponent(PAGE)}`)
  window.showInactive()

  const content = window.getContentBounds()
  const aceptar = { x: content.x + 80, y: content.y + 50 }
  const pointer = new BrowserWindow({
    x: aceptar.x - 30,
    y: aceptar.y - 30,
    width: 60,
    height: 60,
    type: 'panel',
    frame: false,
    transparent: true,
    focusable: false,
    show: false,
  })

  pointer.setIgnoreMouseEvents(true)
  pointer.setAlwaysOnTop(true, 'screen-saver')
  await pointer.loadURL('data:text/html,<body style="background:rgba(70,110,170,0.4)"></body>')
  pointer.showInactive()
  // Дерево доступности страницы встаёт не сразу после показа.
  await new Promise((resolve) => setTimeout(resolve, 800))
  process.stdout.write(
    `${JSON.stringify({
      aceptar,
      rechazar: { x: content.x + 210, y: content.y + 50 },
      text: { x: content.x + 40, y: content.y + 118 },
    })}\n`,
  )
})
