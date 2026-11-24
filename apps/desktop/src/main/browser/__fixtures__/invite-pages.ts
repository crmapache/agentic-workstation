/**
 * Страницы сквозной проверки клика (ADR 0119): случай 24 ноября 2026, когда агент нажал
 * «Aceptar» в Outlook по точке со снимка, а Outlook успел перерисовать панель, и под точкой
 * оказалась «Rechazar». Полоса «Aceptar | Rechazar | Seguir» стоит с x = 300 (кнопки по 120 на
 * 40, верх - 100); shifting - как только мышь пошла, полоса уезжает влево на ширину кнопки, и на
 * месте «Aceptar» встаёт «Rechazar». Ниже - холст 200 на 120 с (100, 300). Счётчик нажатий
 * каждой кнопки и холста - строкой в странице: его видно и в снимке.
 */
export const invitePage = (shifting: boolean) => `<!doctype html><title>Invite</title>
<style>
body{margin:0}
#bar{position:absolute;left:300px;top:100px;display:flex}
#bar button{width:120px;height:40px;margin:0;padding:0;border:1px solid #000;font:14px sans-serif}
canvas{position:absolute;left:100px;top:300px;width:200px;height:120px;background:#ddd}
#count{position:absolute;left:20px;top:500px}
</style>
<div id="bar"><button>Aceptar</button><button>Rechazar</button><button>Seguir</button></div>
<canvas width="200" height="120"></canvas>
<p id="count"></p>
<script>
  window.counts = { Aceptar: 0, Rechazar: 0, Seguir: 0, Canvas: 0 }
  const show = () => {
    document.getElementById('count').textContent = Object.entries(window.counts)
      .map(([name, count]) => 'Pressed ' + name + ' ' + count).join(', ')
  }
  const press = (name, event) => {
    window.counts[name] += 1
    window.lastDown = [event.clientX, event.clientY]
    show()
  }
  for (const button of document.querySelectorAll('#bar button')) {
    button.addEventListener('mousedown', (event) => press(button.textContent, event))
  }
  document.querySelector('canvas').addEventListener('mousedown', (event) => press('Canvas', event))
  show()
  ${shifting ? "addEventListener('mousemove', () => { document.getElementById('bar').style.left = '180px' }, { once: true })" : ''}
</script>`

/** Неподвижная полоса во фрейме другого источника: iframe с (40, 60), без рамки. */
export const inviteFramePage = (cross: string) => `<!doctype html><title>Invite frame</title>
<body style="margin:0">
<iframe title="Invite" src="${cross}/invite-still" style="position:absolute;left:40px;top:60px;width:800px;height:560px;border:0"></iframe>`

/**
 * Соседи с похожими именами и подписи полей (ADR 0119): «Save | Don't Save» с (300, 100) по 120 на
 * 40; флажок в подписи-обёртке с (20, 200); флажок в стиле Bootstrap - поле спрятано под подписью,
 * видна подпись и её ::before, с (20, 260); фрейм своего процесса с (20, 320), 300 на 120.
 */
export const formPage = `<!doctype html><title>Form</title>
<style>
body{margin:0;font:16px sans-serif}
#bar{position:absolute;left:300px;top:100px;display:flex}
#bar button{width:120px;height:40px;margin:0;padding:0;border:1px solid #000}
.ccl{position:relative;padding-left:24px}
.ccl::before{content:'';position:absolute;left:0;top:2px;width:16px;height:16px;border:1px solid #000}
</style>
<div id="bar"><button>Save</button><button>Don't Save</button></div>
<div style="position:absolute;left:20px;top:200px"><label id="wrap"><input type="checkbox" id="danger"> Delete my account forever</label></div>
<div style="position:absolute;left:20px;top:260px"><input type="checkbox" id="remember" style="position:absolute;z-index:-1;opacity:0"><label for="remember" class="ccl">Remember me</label></div>
<iframe title="Same frame" src="/frame-same" style="position:absolute;left:20px;top:320px;width:300px;height:120px;border:0"></iframe>
<script>
  window.counts = { Save: 0, "Don't Save": 0 }
  for (const button of document.querySelectorAll('#bar button')) {
    button.addEventListener('mousedown', () => { window.counts[button.textContent] += 1 })
  }
</script>`
