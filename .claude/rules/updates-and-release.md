---
paths:
  - 'apps/desktop/src/main/updates/**'
  - 'apps/desktop/src/main/app-profile.ts'
  - 'apps/desktop/src/shared/updates.ts'
  - 'apps/desktop/electron-builder.yml'
  - 'apps/desktop/scripts/**'
  - 'docs/releasing.md'
  - 'docs/code-signing.md'
---

# Обновления, сборка и выпуск

Устройство - ADR 0004, выпуск - `docs/releasing.md`, подпись - `docs/code-signing.md`.

- **После любой правки здесь - `pnpm --filter @agentic-workstation/desktop update:e2e`.**
  Около двух минут, две настоящие сборки, оба сценария (подделка отвергнута, честное
  обновление встало). Юнит-тесты подмену бандла не проверяют.
- **Не менять без нового ADR:** `appId` в `electron-builder.yml`, имя сертификата в
  `scripts/sign-app.cjs` и `scripts/create-signing-cert.sh`, имена
  артефактов (`agentic-workstation-mac-arm64.*`, `agentic-workstation-win-x64.exe`,
  `latest.json`), формат манифеста. От них
  зависят уже установленные копии: старая версия должна понять новый релиз.
- Формат манифеста меняется только совместимо: новые поля можно добавлять, старые не
  трогать.
- Проверка подписи новой версии (`verifyUpdate`) - главная защита от подменённого
  релиза. Не ослаблять, не обходить флагом.
- Новый сертификат подписи не создавать никогда, если старый существует: это
  отключит обновления у всех установленных копий. Копия - `agentic-workstation-code-signing.p12`
  в корне, не удалять.
- Подписывает хук `scripts/sign-app.cjs`, а не electron-builder (`identity: null`
  намеренно): встроенная подпись требует доверия к сертификату, а его macOS выдаёт
  только через окно с паролем.
- Сборки - мак arm64 и Windows x64 (ADR 0048). Публикация - только скиллом `/build` по прямой
  команде.
- **Windows (ADR 0048):** обновление - установщик NSIS целиком, пускается только с подписью
  Ed25519 ключа выпуска (`isSignedInstaller`). Это та же главная защита, что `verifyUpdate` на
  маке: не ослаблять, не обходить флагом. Ключ `agentic-workstation-update-signing.pem` в корне не
  удалять и новый не создавать - открытый вшит в установленные копии.
