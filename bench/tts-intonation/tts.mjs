// Синтез фраз Flux TTS в WAV - замер интонации вопроса (ADR 0135). Фразы идут одним ходом синтеза,
// как ответ звонка: node tts.mjs <голос> <файл.wav> "Фраза." "Вторая?" ...
// Ключ - DEEPGRAM_API_KEY в окружении, в аргументы и в журнал он не попадает.
import { writeFileSync } from 'node:fs'

const RATE = 24000
const [voice, out, ...sentences] = process.argv.slice(2)
const url = `wss://api.deepgram.com/v2/speak?model=${voice}&encoding=linear16&sample_rate=${RATE}`
const socket = new WebSocket(url, ['token', process.env.DEEPGRAM_API_KEY ?? ''])
const chunks = []
let isDone = false

socket.binaryType = 'arraybuffer'
socket.onopen = () => {
  for (const sentence of sentences)
    socket.send(JSON.stringify({ type: 'Speak', text: `${sentence} ` }))

  socket.send(JSON.stringify({ type: 'Flush' }))
}
socket.onmessage = (event) => {
  if (typeof event.data !== 'string') {
    chunks.push(Buffer.from(event.data))

    return
  }

  // Конец звука хода - SpeechMetadata, а не Flushed (замер 2026-11-21, rules/voice.md).
  if (JSON.parse(event.data).type === 'SpeechMetadata' && !isDone) {
    isDone = true
    setTimeout(() => socket.close(), 500)
  }
}
socket.onclose = () => {
  const pcm = Buffer.concat(chunks)
  const head = Buffer.alloc(44)

  head.write('RIFF', 0)
  head.writeUInt32LE(36 + pcm.length, 4)
  head.write('WAVE', 8)
  head.write('fmt ', 12)
  head.writeUInt32LE(16, 16)
  head.writeUInt16LE(1, 20)
  head.writeUInt16LE(1, 22)
  head.writeUInt32LE(RATE, 24)
  head.writeUInt32LE(RATE * 2, 28)
  head.writeUInt16LE(2, 32)
  head.writeUInt16LE(16, 34)
  head.write('data', 36)
  head.writeUInt32LE(pcm.length, 40)
  writeFileSync(out, Buffer.concat([head, pcm]))
  console.log(out, `${(pcm.length / (RATE * 2)).toFixed(2)} s`)
}
