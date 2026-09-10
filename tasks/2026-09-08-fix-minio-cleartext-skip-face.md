# Fix: upload cleartext (MinIO IP) + pular foto do rosto

- **Status:** Done
- **Branch:** task/fix-minio-cleartext-skip-face
- **Goal:** (1) Uploads via presigned URL param de funcionar no celular — sair de `http://212.56.35.31:9000` (bloqueado por network security policy do Android) pra `https://minio.guardaroupa.rafaelferro.dev`. (2) Onboarding permite pular a foto do rosto por enquanto.
- **Context:** `MINIO_PUBLIC_ENDPOINT=212.56.35.31:9000` no infra/.env; `storage.py` monta `http://{endpoint}` hardcoded → presigned PUT/GET com IP http. MinIO expõe porta 9000 crua na VPS. Face upload usa `requestUploadUrl` → presigned PUT direto no MinIO. Onboarding: measurements → face-capture (obrigatória) → review (redireciona pra face-capture se sem foto). API/avatar já suporta `face_texture_asset_id: null`.

## Decisões
- **MinIO via Traefik**: labels iguais ao backend (websecure, Host `minio.${APP_HOST}`, letsencrypt, rede traefik_proxy); remover `ports: 9000:9000` (não expor cru). Sem mudança de CORS.
- **`minio_public_endpoint` scheme-aware**: `storage.py` usa o valor direto se tiver `://`, senão prefixa `http://` (backward-compat dev). `infra/.env`: `MINIO_PUBLIC_ENDPOINT=https://minio.guardaroupa.rafaelferro.dev`.
- **Skip**: botão "Pular por enquanto" em face-capture (estado com/sem permissão de câmera) → `clearPhoto()` + `router.replace('/onboarding/review')`. Review deixa de redirecionar quando sem foto: mostra estado "sem foto" com "Adicionar foto" (volta pra capture) e "Finalizar onboarding" → `putAvatar({..., face_texture_asset_id: null})` + `markComplete()` + `router.replace('/(tabs)')`.
- **Entrega**: fix MinIO = backend + infra (rebuild). Skip = JS-only → `make publish-js` (OTA runtimeVersion 1). Sem APK novo.

## Checklist
- [x] backend `core/storage.py`: public endpoint scheme-aware.
- [x] infra compose: labels Traefik no minio (Host `minio.${APP_HOST}`, websecure, certresolver, network traefik_proxy), remover porta 9000 publicada.
- [x] infra/.env: `MINIO_PUBLIC_ENDPOINT=https://minio.guardaroupa.rafaelferro.dev`.
- [x] Rebuild/up backend + minio; health + Traefik roteia `https://minio.guardaroupa.rafaelferro.dev/minio/health/live` → 200.
- [x] E2E presigned: register/login → `POST /api/v1/assets/upload-url` → PUT presigned (mock bytes) → `GET /api/v1/assets/{id}` e fetch no download_url (https) devolve bytes.
- [x] mobile face-capture: botão "Pular por enquanto" (permissão negada + câmera).
- [x] mobile review: sem foto → estado com "Finalizar onboarding" (null texture) e "Adicionar foto"; manter caminho com foto intacto.
- [x] `npx tsc --noEmit` limpo; `make publish-js` → update OTA novo (uuid).

## Validation
```bash
curl -sk https://minio.guardaroupa.rafaelferro.dev/minio/health/live   # 200 (via Traefik https)
curl -sk https://guardaroupa.rafaelferro.dev/health                    # ok
# E2E presign (token real):
#   POST /api/v1/assets/upload-url → upload_url começa https://minio.guardaroupa.rafaelferro.dev
#   curl PUT bytes dummy → 200; GET /api/v1/assets/{id} → download_url https → fetch → bytes ok
cd mobile && npx tsc --noEmit
scripts/publish-update.sh   # novo update OTA publicado (não mexe em downloads/manifest.json)
```

## Why not continued


## Validation Log
### 2026-09-08 — QA
- **MinIO https**: health https://minio.guardaroupa.rafaelferro.dev/minio/health/live → 200; upload_url presigned https://minio.guardaroupa.rafaelferro.dev/...; PUT 200; GET hash igual (6b7fa434...); zero 212.56.35.31 nas URLs; porta 9000 crua removida.
- **Manifest updates (corrigido após descobrir que lê campo errado)**: metadata.fileMetadata.android agora parseado; id = sha256(metadata)→UUID (d4384615-0d98-037e-5036-e4fcd9a425fd); launchAsset {url https bundle hbc, hash base64url, key md5, contentType application/javascript}; assets 37 com url absoluta; part extensions presente; no-update directive OK; HEAD bundle 200 (7.2MB), HEAD asset 200 (962KB); headers expo-protocol-version:1 / expo-sfv-version:0 / cache-control ok.
- **Skip face**: tsc limpo; OTA update 94383b8e publicado (runtime 1).
- **Descobrimento**: QA anterior do auto-update validou update SINTÉTICO (metadata com launchAsset top-level) — o export real nunca foi servido direito. Agora portado fiel do custom-expo-updates-server.
