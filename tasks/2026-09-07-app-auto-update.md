# Auto-update híbrido no app (OTA JS + fallback APK)

- **Status:** Validated
- **Branch:** task/app-auto-update
- **Goal:** App Expo baixa sozinho código JS novo (OTA via Expo Updates self-hosted) e, quando versão nativa sobe (versionCode/runtimeVersion), baixa APK novo pela API e abre o installer do Android. Check automático no launch + botão manual no Profile.
- **Context:** APK 1.0.0 (280MB, debug-signed) distribuído em `/downloads/latest.apk`; backend já expõe `GET /api/v1/app/latest` (manifest.json com version/version_code). Usuário escolheu **Híbrido** + **auto no launch + botão manual**. Docs: Expo SDK 57; protocolo Expo Updates v1 (SDK 57 manda `Expo-Protocol-Version: 1` hardcoded — referência de base `/expo/custom-expo-updates-server` cobre v0 e v1); `expo-file-system/legacy` `createDownloadResumable` (tem progresso; o novo `downloadAsync` não); `expo-intent-launcher` para `ACTION_INSTALL_PACKAGE`.

## Decisões travadas (debatidas com frontend/backend + plan-validator)
- **runtimeVersion**: string explícita, top-level `expo.runtimeVersion`, igual ao versionCode (ex: `"1"`). Policy `appVersion`/`nativeVersionCode` NÃO usar (deprecated SDK 57). Sobe junto com `android.versionCode` em mudança nativa.
- **Protocolo**: **v1** (SDK 57 manda `Expo-Protocol-Version: 1` hardcoded; v0 só em Expo Go). Resposta DEVE ecoar headers `expo-protocol-version: 1`, `expo-sfv-version: 0`, `cache-control: private, max-age=0`. SEM code signing (`expo-expect-signature` ignorado quando app.json não configura codeSigning).
- **No-update**: protocol ≥1 → directive part `{"type":"noUpdateAvailable"}` no multipart. Client manda `Expo-Current-Update-ID` em UUID lowercase → comparar lowercase; `updateId` (`uuidgen` lowercase) e `createdAt` (ISO8601 `...Z`) gerados no publish-update.sh — manifest `id` é parseado como UUID pelo client.
- **Storage**: `infra/updates/{runtimeVersion}/{updateId}/` (dist copiado do `expo export`) + symlink `infra/updates/{runtimeVersion}/latest → {updateId}`. Rollback = trocar symlink. Sem DB. `updateId` = UUID, `createdAt` = ISO8601 Z — gerados no publish-update.sh.
- **Sequência (evita double-prompt)**: checagem própria (`/api/v1/app/latest`) decide APK-first.
  - Se `parseInt(latest.version_code) > parseInt(Application.nativeBuildVersion)` (`expo-application` — `Constants.nativeBuildVersion` foi REMOVIDO no SDK 57; `AndroidManifest.versionCode` deprecated) → caminho APK (OTA não tem nada: runtimeVersion velho vs updates novos não casa). Download com progresso → installer do Android.
  - Se igual → só OTA: `Updates.checkForUpdateAsync()`; se disponível → aplicar no próximo launch (silencioso) ou botão "Reiniciar para aplicar" (`Updates.reloadAsync()`).
- **Auto-check nativo desligado**: `updates.checkAutomatically: 'NEVER'` — se não, expo-updates checa no launch fora do controle do store → double-check real. Store (e botão manual) comandam tudo.
- **Download APK**: `expo-file-system/legacy` (import explícito do subpath — no SDK 57 import default joga throw). Progresso importa: 280MB. `getContentUriAsync` para content:// do FileProvider.
- **Native config**: config plugin custom (`plugins/withAndroidUpdatePermissions.js`) adiciona `REQUEST_INSTALL_PACKAGES` + `<queries>` INSTALL_PACKAGE; verifica FileProvider do expo-file-system no prebuild (authority `${applicationId}.fileprovider`) e adiciona se ausente.
- **OTA blocking**: `fallbackToCacheTimeout: 0` — app NÃO espera OTA na splash (check em background, aplica no próximo launch). 5000 travaria splash até 5s.
- **State machine (zustand)**: `idle → checking_apk → update_available → downloading → ready_to_install → installing`; e `checking_ota → ota_pending_reload → up_to_date`. Gate `isChecking` bloqueia race manual/auto.

## Checklist
- [x] Backend: `GET /api/updates/manifest` (protocolo v1) — valida headers `expo-platform`/`expo-runtime-version` (ausente/`ios` → 400), resolve symlink `latest` do runtime, lê `metadata.json`, monta multipart/mixed com manifest (launchAsset + assets com URLs absolutas https via X-Forwarded); resposta com headers `expo-protocol-version: 1`, `expo-sfv-version: 0`, `cache-control: private, max-age=0`; no-update → directive part `{"type":"noUpdateAvailable"}` quando `expo-current-update-id` (lowercase) = id do latest.
- [x] Backend: servir assets do update — mount de `infra/updates` em `/api/updates/files/<runtime>/<updateId>/<file>` (StaticFiles, suporta HEAD). Rota do manifest DEFINIDA ANTES dos mounts estáticos.
- [x] Backend: volume novo `infra/updates:/app/updates` no serviço backend (docker-compose).
- [x] Script `scripts/publish-update.sh`: `npx expo export --platform android --output-dir dist` (setsid — export demora), lê runtimeVersion via `npx expo config --json`, `updateId=$(uuidgen)` (lowercase), `createdAt` ISO8601 Z, copia dist → `infra/updates/{runtime}/{updateId}`, flip symlink `latest` (`ln -sfn`), imprime resumo. NÃO mexe em downloads/manifest.json (JS-only não pode mentir versionCode do `/api/v1/app/latest`).
- [x] Makefile: criar target `make publish-js` → roda publish-update.sh; `make apk` segue full (build + downloads via build-apk.sh).
- [x] infra/.gitignore: adicionar `updates/`.
- [x] Mobile deps: `npx expo install expo-updates expo-file-system expo-intent-launcher expo-application`.
- [x] `app.json`: `runtimeVersion: "1"` (top-level), `updates: { url: "https://guardaroupa.rafaelferro.dev/api/updates/manifest", enabled: true, checkAutomatically: "NEVER", fallbackToCacheTimeout: 0 }`, plugin `expo-updates`, plugin custom.
- [x] Mobile: `plugins/withAndroidUpdatePermissions.js` — permissão REQUEST_INSTALL_PACKAGES + queries INSTALL_PACKAGE + FileProvider garantido.
- [x] Mobile: `src/core/updates/updateStore.ts` (zustand) — check(), download(), install(); armazena `{status, latest, progress}`; usa `Application.nativeBuildVersion` (string → `parseInt` nos dois lados).
- [x] Mobile: `src/core/api/appInfo.ts` — tipo `AppLatest` + `api.get('/api/v1/app/latest')`.
- [x] Mobile: UI no Profile (`app/(tabs)/two.tsx`) — seção "Atualizações": status, botão "Verificar atualização", barra de progresso durante download, botão "Instalar agora" quando baixado.
- [x] Mobile: check no launch — `app/_layout.tsx` dispara uma vez; APK disponível → modal com "Atualizar agora / Depois"; OTA disponível → aguarda próximo launch.
- [x] Mobile: installer — `IntentLauncher.startActivityAsync('android.intent.action.INSTALL_PACKAGE', { data: contentUri, type: 'application/vnd.android.package-archive', flags: IntentLauncher.FLAG_GRANT_READ_URI_PERMISSION })`; contentUri via `File.getContentUriAsync()` do expo-file-system.

## Subtasks
- **backend:** endpoints `/api/updates/manifest` (v1) + mount `/api/updates/files`, volume novo, curl tests. Base: protocolo v1 do custom-expo-updates-server; multipart/mixed manual (`Response`, part `Content-Disposition: form-data; name="manifest"`); assets grandes via `StreamingResponse`/StaticFiles (não carregar em memória); headers de resposta `expo-protocol-version: 1` + `expo-sfv-version: 0` + `cache-control`.
- **frontend:** deps (+expo-application), app.json (runtimeVersion top-level + checkAutomatically NEVER), config plugin custom, updateStore, Profile UI, launch check, installer. Gates: `npx tsc --noEmit`, `npx expo-doctor`, prebuild dry-run (grep AndroidManifest + `res/values/strings.xml`), `./gradlew assembleRelease`, `npx expo export`.

## Validation
```bash
# backend — manifest (v1)
curl -sk -H "expo-platform: android" -H "expo-runtime-version: 1" -H "expo-current-update-id: " https://guardaroupa.rafaelferro.dev/api/updates/manifest | head -c 400
# → 200, Content-Type multipart/mixed c/ boundary; headers expo-protocol-version: 1 + expo-sfv-version: 0 + cache-control; part manifest com launchAsset URL absoluta https
curl -sk -H "expo-platform: android" -H "expo-runtime-version: 1" -H "expo-current-update-id: <latest-uid>" -D - https://guardaroupa.rafaelferro.dev/api/updates/manifest
# → directive part {"type":"noUpdateAvailable"}
curl -sk -o /dev/null -w "%{http_code}" -H "expo-platform: ios" -H "expo-runtime-version: 1" https://guardaroupa.rafaelferro.dev/api/updates/manifest
# → 400
curl -skI <url_asset_do_manifest>
# → 200, Content-Length casa com size/hash do metadata

# mobile (no device; escape é manual do usuário)
cd mobile && npx tsc --noEmit
npx expo-doctor
npx expo prebuild --platform android --clean --no-install   # grep AndroidManifest.xml: EXPO_UPDATE_URL, REQUEST_INSTALL_PACKAGES, fileprovider, queries INSTALL_PACKAGE; grep res/values/strings.xml: expo_runtime_version
cd android && ./gradlew assembleRelease                     # setsid — build ~9min
npx expo export --platform android --output-dir dist        # metadata.json válido

# integração
scripts/publish-update.sh  # gera infra/updates/{runtime}/{uid=uuid lowercase}/ + symlink latest
curl -sk "https://guardaroupa.rafaelferro.dev/api/v1/app/latest"   # segue ok (publish-js NÃO toca)
```

## Why not continued


## Validation Log
### 2026-09-08 — QA PASS
- Manifest v1: 200 multipart/mixed + headers `expo-protocol-version: 1`/`expo-sfv-version: 0`/`cache-control: private, max-age=0`; launchAsset URL https ✓
- No-update (current id = b1728ef3-7dc3-4338-8991-e6fe5e9c56c4) → directive `noUpdateAvailable` ✓
- platform ios / sem runtime-version → 400; runtime 999 → 404 ✓
- Asset via /api/updates/files → 200 ✓ (HEAD asset ok; HEAD /downloads/latest.apk dá 405 pré-existente — GET ok, não bloqueia)
- /api/v1/app/latest → version 1.0.0, version_code 1, size_bytes 297876259 casa com APK real (Android package) ✓
- /downloads/latest.apk → 200, 297876259 bytes ✓
- Update bundle: infra/updates/1/b1728ef3-.../ + symlink latest; metadata id/createdAt ok ✓
- Mobile gates (reportados pela implementação): tsc limpo; expo-doctor ok; prebuild com REQUEST_INSTALL_PACKAGES/FileProvider/EXPO_UPDATE_URL/`expo_runtime_version="1"`; assembleRelease 12m58s; export + publish ✓
- HEALTH https://guardaroupa.rafaelferro.dev/health → ok ✓
- Teste em device (instalar APK, atualização real) fica com o usuário — sem device no ambiente.
