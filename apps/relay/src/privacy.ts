/**
 * Страница /privacy - простым текстом, без клиента и без скриптов: что релей видит и чего не
 * видит. Отдаётся самим релеем, а не из папки клиента: политика не должна пропасть вместе с
 * неудачной сборкой телефона.
 */
export const PRIVACY_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Agentic Workstation relay - privacy</title>
<style>
body { max-width: 40rem; margin: 2rem auto; padding: 0 1rem; font: 16px/1.5 system-ui, sans-serif; color: #ddd; background: #111; }
h1 { font-size: 1.4rem; }
h2 { font-size: 1.1rem; margin-top: 1.6rem; }
</style>
</head>
<body>
<h1>Agentic Workstation relay: privacy</h1>
<p>This relay connects Agentic Workstation on your computer with your phone. It is content-blind: everything that passes through it is end-to-end encrypted between the two devices, and the relay has no keys to read it.</p>
<h2>What the relay sees</h2>
<p>Each frame carries a 42-byte header with two random 16-byte addresses (who it is for and who sent it), a counter and the frame type. The relay routes frames by address only. It also sees the size of each frame, when it passed, and the IP address of each connection, which it uses to limit how many connections one caller may open.</p>
<h2>What the relay cannot see</h2>
<p>Your code, files, projects, conversations, commands, prompts, answers and the names of your projects. Frame bodies are never parsed, decoded or logged. The addresses are random and contain nothing about you, your phone or your computer.</p>
<h2>What is stored</h2>
<p>Nothing is stored on disk. When a device is briefly offline, frames for it are held in memory for up to two minutes and then dropped. A restart of the relay forgets everything.</p>
<h2>Logs</h2>
<p>Service logs record connections and errors with the first four bytes of an address, never a frame body. They are kept for 7 days and then deleted.</p>
</body>
</html>
`
