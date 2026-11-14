// Хук electron-builder (afterPack): сборка ещё не упакована в установщики. Сначала проверка,
// что нативные модули своей системы на месте (check-native.cjs), потом подпись бандла мака
// (sign-app.cjs) - подписывать неполную сборку незачем.

const checkNative = require('./check-native.cjs')
const signApp = require('./sign-app.cjs')

module.exports = async function afterPack(context) {
  checkNative(context)
  await signApp(context)
}
