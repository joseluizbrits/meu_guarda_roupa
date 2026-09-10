# Otimizar render 3D + vestir boneco com múltiplas peças (shell volumétrico)

- **Status:** Done
- **Branch:** task/3d-shell-multipecas
- **Goal:** Boneco 3D carrega + troca peças rápido; múltiplas peças simultâneas (1 por região: upper/lower/dress/feet); roupa vira malha 3D volumétrica envolvente (não decal plano).
- **Context:** Hoje `Avatar3DView` usa decal plano transparente flutuando na frente do corpo, 1 peça só (`equippedItem` single), troca de peça remonta GLView inteiro via `key` (re-parse GLB 1.9MB + texturas → demora). Render loop RAF 60fps incondicional. GLB BaseHuman.glb = 1 mesh skinned, 5 primitives cobrindo o corpo inteiro (sem slots por região), UVs existem (TEXCOORD_0). Decisão do usuário: shell 3D volumétrico (malha curva 360°) + uma peça por região. Refinamentos pós-demo (usuário): (1) boneco voltava com pose/posição diferente ao alternar abas (state acumulado no gltf compartilhado; fix = clone do scene por montagem via SkeletonUtils.clone); (2) boneco vestia cutout U2Net (foto real sem fundo, vinco de cabide) em vez da imagem IA; decisão do usuário: vestir com imagem IA transparente (`ai_texture_url`, chroma key do fundo branco server-side).

## Checklist
- [x] Nova branch `task/3d-shell-multipecas`
- [x] `garmentShell.ts`: geometria cilíndrica volumétrica por região (torso/lower/dress/feet), UV planar projetado, alphaTest p/ descartar fundo transparente
- [x] `Avatar3DView`: cache GLB parseado (promise module-level), cache texturas por URL, aplicar/remover shells dinamicamente SEM remount, render sob demanda (dirty flag)
- [x] Props multi-peça: `equippedGarments: Array<{category, textureUrl, id}>` em vez de `equippedGarment` single
- [x] `index.tsx` Fitting Room: state `equippedByRegion` com 1 por região (upper/lower/dress/feet), picker toggle, dress vs top/bottom exclusão mútua
- [x] Remover `key={equippedItem?.id}` do Avatar3DView
- [x] tsc --noEmit limpo
- [x] Build OTA + APK, publish (OTA 7d69cf95, APK 1.0.1 rebuild 297908207 bytes)
- [x] Fix pose: clone do scene por montagem (SkeletonUtils.clone) — boneco sempre volta na mesma pose
- [x] Backend: `make_transparent_texture` (chroma key fundo branco → transparente), campo+asset `ai_texture_asset_id`, schema + `to_read`, job background e `virtualize` gravam textura, migração `b7f2a9c3a1d4`, backfill script (4/4 OK)
- [x] Mobile: wearable/equipped usam `ai_texture_url ?? texture_url`; pre-warm com textura IA
- [x] OTA novo (d42b367d), backend deployado (migração + backfill), health OK
- [x] Fix pose: remover `relaxArmsToSides` (pose nativa do modelo — braços 58° pareciam tortos no device) + `onLayout` refit de camera/renderer (aspect NaN na montagem esticava o avatar)
- [x] Picker mostra TODAS as peças (não só com textura), badge "processando…"/"sem corte", poll ~6s×12 até a IA gerar `ai_texture_url`
- [x] `select-pieces`: decode da foto 1x + crops SEQUENCIAIS (parallel OOM dropava peças silenciosamente — 5 escolhidas, 2 criadas) + alerta de peças descartadas
- [x] OTA ec10eb82 publicado, manifest 200

## Subtasks
- **frontend:** skeleton do shell 3D + refactor Avatar3DView + Fitting Room multi-peça
- **backend:** nenhum (tudo client-side; backend já serve texture_url)

## Validation
- `cd mobile && npx tsc --noEmit`
- build OTA via `scripts/publish-update.sh`, build APK via `scripts/build-apk.sh`
- smoke: API manifest + APK downloads 200

## Why not continued
<não pausado>

## Validation Log
### 2026-09-08T19:55:38.108Z

- `tsc --noEmit: limpo` → exit 1
```
error TS5023: Unknown compiler option '--noEmit:'.
```

- `cd mobile && npx tsc --noEmit` → SKIPPED (not in allowlist)

- `build OTA via `scripts/publish-update.sh`, build APK via `scripts/build-apk.sh` → SKIPPED (not in allowlist)

- `smoke: API manifest + APK downloads 200` → SKIPPED (not in allowlist)

- `OTA 287a131e bundle 200 (7.28MB hbc` → SKIPPED (not in allowlist)

- `APK 1.0.2 / versionCode 3 (expo-image nativo), 303,835,101 bytes, download 200` → SKIPPED (not in allowlist)

- `/api/v1/app/latest: version 1.0.2, version_code 3` → SKIPPED (not in allowlist)

- `Fix critico: shells agora no gltf.scene (herdam offset do avatarGroup) — antes flutuavam fora do personagem` → SKIPPED (not in allowlist)

- `demo: expo-image disk cache no closet+picker; warmTextureCache pre-aqueca cutouts no Fitting Room` → SKIPPED (not in allowlist)

- `Fix pose: SkeletonUtils.clone por montagem — sem acumular braços rotacionados/shells duplicados/decals ao alternar abas` → SKIPPED (not in allowlist)

- `ai_texture_url: chroma key no fundo branco → transparente; 4 itens backfillados OK; API manifest novo (d42b367d) 200; /api/v1/app/latest 1.0.2/3 200` → SKIPPED (not in allowlist)

- tsc --noEmit: limpo
- OTA 287a131e bundle 200 (7.28MB hbc)
- APK 1.0.2 / versionCode 3 (expo-image nativo), 303,835,101 bytes, download 200
- /api/v1/app/latest: version 1.0.2, version_code 3
- Fix critico: shells agora no gltf.scene (herdam offset do avatarGroup) — antes flutuavam fora do personagem
- demo: expo-image disk cache no closet+picker; warmTextureCache pre-aqueca cutouts no Fitting Room
- Fix pose: SkeletonUtils.clone por montagem — sem acumular braços rotacionados/shells duplicados/decals ao alternar abas
- ai_texture_url: chroma key no fundo branco → transparente; 4 itens backfillados OK; API manifest novo (d42b367d) 200; /api/v1/app/latest 1.0.2/3 200
- Pose: GLB sem anim/herança (parse binário: 0 transforms não-identidade, 0 animations) → torto vinha do runtime; removido rotacão 58° braços + refit viewport
- select-pieces: backend 21:16 registrou detect 200 + apenas 2/5 criações (3 crops OOM silenciosos) — corrigido (sequencial) e alerta visível
- OTA ec10eb82: manifest 200
- **Encerrado**: chain toda mergeada em main (`7a7a5e2`, 4 merges em ordem via git); PRs 3–16 merged, 17–20 fechados; stack gh #21 concluído. Produção já roda (deploys diretos anteriores). Próxima feature: seguir fluxo `gh stack` desde o início.