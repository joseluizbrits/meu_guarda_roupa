# Otimizar render 3D + vestir boneco com múltiplas peças (shell volumétrico)

- **Status:** Implementing
- **Branch:** task/3d-shell-multipecas
- **Goal:** Boneco 3D carrega + troca peças rápido; múltiplas peças simultâneas (1 por região: upper/lower/dress/feet); roupa vira malha 3D volumétrica envolvente (não decal plano).
- **Context:** Hoje `Avatar3DView` usa decal plano transparente flutuando na frente do corpo, 1 peça só (`equippedItem` single), troca de peça remonta GLView inteiro via `key` (re-parse GLB 1.9MB + texturas → demora). Render loop RAF 60fps incondicional. GLB BaseHuman.glb = 1 mesh skinned, 5 primitives cobrindo o corpo inteiro (sem slots por região), UVs existem (TEXCOORD_0). Decisão do usuário: shell 3D volumétrico (malha curva 360°) + uma peça por região.

## Checklist
- [x] Nova branch `task/3d-shell-multipecas`
- [x] `garmentShell.ts`: geometria cilíndrica volumétrica por região (torso/lower/dress/feet), UV planar projetado, alphaTest p/ descartar fundo transparente
- [x] `Avatar3DView`: cache GLB parseado (promise module-level), cache texturas por URL, aplicar/remover shells dinamicamente SEM remount, render sob demanda (dirty flag)
- [x] Props multi-peça: `equippedGarments: Array<{category, textureUrl, id}>` em vez de `equippedGarment` single
- [x] `index.tsx` Fitting Room: state `equippedByRegion` com 1 por região (upper/lower/dress/feet), picker toggle, dress vs top/bottom exclusão mútua
- [x] Remover `key={equippedItem?.id}` do Avatar3DView
- [x] tsc --noEmit limpo
- [ ] Build OTA + APK, publish

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
<pendente>