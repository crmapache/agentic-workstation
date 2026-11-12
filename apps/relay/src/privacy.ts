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
<p>This relay connects Agentic Workstation on your computer with your phone. It is content-blind: everything that passes through it is end-to-end encrypted between the two devices, and the relay has no keys to read it. One caveat about the phone app is below.</p>
<h2>What the relay sees</h2>
<p>Each frame carries a 42-byte header with two 16-byte addresses (who it is for and who sent it), a counter and the frame type. The relay routes frames by address only. An address is derived from a signing key that each device creates for itself, and a device proves it holds that key every time it connects, so nobody who merely knows an address can take it over. It also sees the size of each frame, when it passed, and the IP address of each connection, which it uses to limit how many connections one caller may open.</p>
<h2>What the relay cannot see</h2>
<p>Your code, files, projects, conversations, commands, prompts, answers and the names of your projects. Frame bodies are never parsed, decoded or logged. The addresses are derived from random keys and contain nothing about you, your phone or your computer.</p>
<h2>Notifications</h2>
<p>If you turn on notifications on your phone, your phone's browser gives your IDE an address at its push service (Apple, Google, Mozilla or Microsoft), and the IDE keeps it with the pairing. When the IDE needs you and your phone is not connected, it hands the relay that address together with a notification it has already encrypted for your phone. The relay passes the notification to the push service and forgets both. It sees which push service is used, when and how big the notification is, but not what it says: only your phone has the key. The push service sees even less, because the browser adds its own encryption on top. The relay only calls the push services of the major browsers and nothing else.</p>
<h2>What is stored</h2>
<p>Nothing is stored on disk. When a device is briefly offline, frames for it are held in memory for up to two minutes and then dropped. A restart of the relay forgets everything.</p>
<h2>The phone app comes from this relay</h2>
<p>The relay also serves the phone app you open in the browser. Your phone runs whatever code this server sends it, and that code holds the keys of your pairing. So the encryption protects your data from the relay as long as the relay serves the genuine app. If this server were taken over, it could send a modified app that reads what your phone shows and sends. The pages are served with a strict content security policy, but that does not help against the server itself. Running your own relay, checking the app's files against the published source, or installing the app from a separate trusted place are the ways to reduce this trust; none of them is built in yet.</p>
<h2>Logs</h2>
<p>Service logs record connections and errors with the first four bytes of an address, never a frame body. They are kept for 7 days and then deleted.</p>
</body>
</html>
`
