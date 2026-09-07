# Build local de APK + distribuição por link estático

- **Status:** Validated
- **Branch:** task/apk-local-build
- **Goal:** Comando (`make apk` / `scripts/build-apk.sh`) gera APK Android release do app Expo; APK servido via HTTP estático em link fixo versionado e listável — usuário baixa versões direto.
- **Context:** App Expo SDK 57 managed (expo-router, RN 0.86). Deploy via Traefik em `guardaroupa.rafaelferro.dev`. Decisão usuário: **build local** (não EAS cloud).

## Checklist
- [x] Preparar build local Android: JDK 17 + Android commandline tools + SDK platform 36 + build-tools 36 + licenças — instalados em `/opt/android-sdk`.
- [x] Fixar `EXPO_PUBLIC_API_URL=https://guardaroupa.rafaelferro.dev` — `.env` no mobile (bakeado no bundle).
- [x] Adicionar `android.package` (`com.rafaelferro.meuguardaroupa`) + `versionCode: 1` no `app.json`.
- [x] `npx expo prebuild --platform android --no-install` gerou `mobile/android/`.
- [x] `./gradlew assembleRelease` gerou APK assinado (debug key) — `app-release.apk`, 280MB.
- [x] Servir APKs: endpoint `GET /downloads` + `GET /downloads/{filename}` no backend (FileResponse), volume bind `infra/downloads:/app/downloads`.
- [x] Versionar: `meu-guarda-roupa-1.0.0.apk` copiado pro dir servido.
- [x] Rota índices listando versões (`/downloads/` HTML).
- [x] Validar: health 200, index listando APK, download via GET devolve APK íntegro (range 1MB → "Android package").

## Subtasks
- **frontend (mobile):** `app.json` + `.env` — feito.
- **backend:** endpoint `/downloads` + `/downloads/{filename}` — feito.
- **infra/compose:** volume bind `./downloads:/app/downloads` — feito.
- **script:** `scripts/build-apk.sh` + `make apk` rebuild repetível — feito.

## Validation
- (docker compose -f infra/docker-compose.yml config) → OK parseou
- (npx expo prebuild --platform android --no-install) → OK, nativo gerado
- (cd android && ./gradlew assembleRelease) → BUILD SUCCESSFUL 8m55s, 1012 tasks
- (curl -sf https://guardaroupa.rafaelferro.dev/downloads/) → HTML listing com `meu-guarda-roupa-1.0.0.apk` (280 MB)
- (curl -sf https://guardaroupa.rafaelferro.dev/downloads/meu-guarda-roupa-1.0.0.apk -o x) → "Android package (APK)"
- apksigner verify → assinatura OK (CN=Android Debug)

## Why not continued
<não aplicável — concluído>

## Validation Log
- 2026-09-03 22:xx — build gradle local sucesso; APK 280MB assinado; `/downloads` index + arquivo 200; health ok. Commit `6675182`.
