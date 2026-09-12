# Roupa 3D real: malhas-template por categoria (garment template meshes)

- **Status:** Done
- **Branch:** task/garment-template-mesh
- **Goal:** Peças vestidas deixam de ser imagem 2D em cilindro genérico e viram **malha 3D com silhueta real de roupa** (manga, cintura, bainha, caimento, forma de tênis). 5 GLBs-template por categoria (top/outerwear/dress/bottom/shoes), textura IA existente (`ai_texture_url`) re-mapeada no template, fit no avatar por medidas de bind-pose.
- **Context:** Hoje `garmentShell.ts` estampa o recorte 2D transparente num `CylinderGeometry`/`BoxGeometry` com UV planar + `alphaTest` — resultado lê como adesivo no corpo (sem relevo/silhueta). Base: avatar `BaseHuman.glb` (skinned, A-pose estático, ~12k tris), bones: `neck`, `spine02`, `pelvis`, `upperarm_L/R`, `thigh_L/R`, `calf_L/R`, `foot_L/R`, `toes_L/R`. **Decisões do usuário:** (1) rota = malhas-template por categoria; (2) hosting = **bundled no app** (como BaseHuman.glb), versionado junto com OTA/APK. Backend: nenhuma mudança necessária (CPU-only, sem GPU). Debatido com @frontend e @backend; ver notas de risco no `garmentTemplate.ts` design.

## Checklist
- [x] Nova branch `task/garment-template-mesh`
- [x] 5 GLBs-template (top, outerwear, dress, bottom, shoes): A-pose, bone names idênticos ao BaseHuman, ~800–1200 tris cada, origem/cena alinhada ao bind pose do avatar. Origem: Mixamo/community (Kenney/OpenGameArt/Sketchfab CC) retargetado OU autorado em Blender (armature reparent → Auto Weight → export GLB simples, 1 mesh por peça)
- [x] Bundle: `mobile/assets/models/garmentTemplates/{category}.glb`, carregado via `Asset.fromModule(require(...))` (mesmo padrão do BaseHuman.glb); metro.config já aceita `.glb` (assetExts)
- [x] `garmentTemplate.ts` novo: cache module-level dos GLB-template (promise, mesmo padrão `gltfCache`) — **ownership: geometry/material do cache é COMPARTILHADO e intocável; cada attach usa `mesh.clone()` (geometry compartilhada + clone do mesh por attach, pois 1 Object3D não pode ter 2 parents); dispose só do clone, NUNCA do cache compartilhado (mesma regra do `loadTextureCached`)**
- [x] Posicionamento/Scale-fit: reusar `bindPosePosition` (refs: neck/pelvis/spine02/upperarm/thigh/calf/foot/toes) p/ posicionar + escalar cada template na região certa; clearance p/ não atravessar a pele; fatores por categoria ajustáveis (constantes centralizadas)
- [x] UV planar overwrite no geometry do template: `u = 0.5 + localX/width`, `v = (localY - minY)/height`; **espelho de trás explícito: faces com `normal.z < 0` (espaço bind-pose) recebem `u = 1 - u`** — template fechado tem triângulos front/back distintos, regra de detecção é por normal, não "mesma técnica do shell" (shell atual não espelha nada)
- [x] Material: `MeshStandardMaterial` (texture cache existente), `alphaTest: 0.05`, `transparent`, `DoubleSide`, **anti z-fighting**: `depthWrite: false`, `polygonOffset: true` + `polygonOffsetFactor: -1`
- [x] **Ordem de render entre peças sobrepostas definida (three.js renderiza transparentes por distância): `renderOrder` crescente, maior = desenha por cima.** Cadeia: `shoes:10 < bottom:20 < top:30 < dress:40 < outerwear:50` — outerwear cobre top; dress cobre tudo exceto quando top/bottom (exclusão mútua já existe no Fitting Room), shoes por baixo de bottom (desenha primeiro)
- [x] `Avatar3DView.tsx`: reconciliar templates no lugar dos cylinders — mantém remove-por-nome + Promise.all de texturas + render on-demand (dirty flag); sem remount
- [x] **Fallback fail-open:** se template falhar ao carregar, cai pro shell cilíndrico atual (mesma filosofia "keep cutout" do restante do app)
- [x] `tsc --noEmit` limpo; checar AGENTS.md mobile: ler docs Expo v57 antes de codar
- [x] Build OTA (`scripts/publish-update.sh`) + APK (`scripts/build-apk.sh`), publicar
- [ ] Smoke visual no device (**pendente usuário**): rotacionar avatar com top+bottom+shoes; verificar silhueta real, z-fighting, fringe de alpha, fit nos ombros/cintura

## Subtasks
- **frontend:** modelar/adquirir + riggar os 5 templates; `garmentTemplate.ts`; integrar em `Avatar3DView`; UV rewrite; fallback; build OTA/APK
- **backend:** nenhum (templates bundled; backend já serve `ai_texture_url`)

## Validation
- `cd mobile && npx tsc --noEmit`
- `scripts/publish-update.sh` → manifest 200
- `scripts/build-apk.sh` → APK download 200
- Smoke manual no device: avatar gira com top+outerwear+bottom+dress+shoes; sem z-fighting nem fringe
- APIs: `/api/v1/app/latest` responde (versão nova)

## Why not continued
<não pausado>

## Validation Log
### 2026-09-12T05:07:42.998Z

- `cd mobile && npx tsc --noEmit` → SKIPPED (not in allowlist)

- `scripts/publish-update.sh` → manifest 200` → SKIPPED (not in allowlist)

- `scripts/build-apk.sh` → APK download 200` → SKIPPED (not in allowlist)

- `Smoke manual no device: avatar gira com top+outerwear+bottom+dress+shoes; sem z-fighting nem fringe` → SKIPPED (not in allowlist)

- `APIs: `/api/v1/app/latest` responde (versão nova` → SKIPPED (not in allowlist)

- `<vazio — aguardando QA>` → SKIPPED (not in allowlist)

### 2026-09-12T05:47:00.000Z (implementer @frontend)

- 5 GLBs autorados via `mobile/scripts/generate-garment-templates.mjs` (three primitives + GLTFExporter, commitado) — dimensões medidas do bind pose real do BaseHuman (neck y1.49, pelvis y0.85, calf y0.50, foot/toes x±0.19 z0.006→0.154)
  - `top.glb`: 864 tris, 24,144 bytes, bbox 0.440×0.600×0.350 (torso+sleeves curtas+hem)
  - `outerwear.glb`: 1,072 tris, 28,880 bytes, bbox 0.460×0.860×0.370 (torso+full sleeves+hem longo)
  - `dress.glb`: 944 tris, 25,732 bytes, bbox 0.440×0.930×0.440 (cintura afunilada → flare na batata)
  - `bottom.glb`: 1,036 tris, 28,144 bytes, bbox 0.390×0.422×0.304 (perna dupla + cintura + gancho)
  - `shoes.glb`: 1,016 tris (2×~508), 33,464 bytes, bbox 0.455×0.120×0.183 (bico fechado, `shoesShell_L/R` clones da mesma geometria)
  - Todos dentro do alvo 800–1200 tris; verificação independente: `mobile/scripts/verify-garment-templates.mjs` (GLTFLoader parse, conta tris por accessor único, checa bbox)
- `garmentTemplate.ts`: cache promise module-level por categoria (padrão `gltfCache`), geometry do cache COMPARTILHADA e intocável; por attach `mesh.clone()` (mesh/material próprios; só o clone é descartável); UV planar em espaço local com espelho por normal (`u = 0.5 + localX/width`, `v = (localY - minY)/height`, `normal.z < 0 → u = 1 - u`); fit por `bindPosePosition` (top/outerwear/dress = neck+pelvis/calf_L+spine02; bottom = pelvis+calf_L+thighs; shoes = foot+toes por lado); constants de escala + clearance 0.025; material `MeshStandardMaterial` alphaTest 0.05 / transparent / DoubleSide / depthWrite false / polygonOffset -1; renderOrder shoes10<bottom20<top30<dress40<outerwear50
- `Avatar3DView.tsx`: trocou por attach template (remove-por-nome, Promise.all de texturas, render on-demand, SEM remount); `garmentShell` fica como fallback fail-open (template falhou → cilindro clássico)
- `app/(tabs)/index.tsx`: `warmTemplateCache()` junto do `warmTextureCache`
- `cd mobile && npx tsc --noEmit` → limpo (exit 0)
- OTA: `scripts/publish-update.sh` → updateId `1d1b518f-5194-4e94-95d6-f2e4e17d667e` publicado; manifest 200; 6 `.glb` (BaseHuman + 5 templates) embarcados no bundle
- APK: `scripts/build-apk.sh` → `meu-guarda-roupa-1.0.4.apk` (305,273,001 bytes, versionCode 5), download 200, `/api/v1/app/latest` → `{"version":"1.0.4","version_code":5}` 200
- Smoke manual no device: PENDENTE — itens para conferir: silhueta real top+bottom+shoes juntos; ordem/sobreposição dress×outerwear; z-fighting (depthWrite/polygonOffset); fringe de alpha nas bordas do recorte; fit de mangas/ombros/cintura das mangas na batata; se algum template falhar, conferir que cai no shell cilíndrico (fail-open)

### 2026-09-12T06:20:00.000Z (QA)

- `cd mobile && npx tsc --noEmit` → PASS (exit 0)
- 5 GLBs re-verificados: tris dentro de 800–1200 (top 864, outerwear 1072, dress 944, bottom 1036, shoes 1016) ✓
- `garmentTemplate.ts`: constraints do validator presentes — cache promise module-level, `mesh.clone()` por attach, dispose só do clone, espelho `normal.z < 0 → u = 1-u`, renderOrder 10/20/30/40/50, alphaTest 0.05 + depthWrite false + polygonOffset -1, fallback shell cilíndrico ✓
- docker-compose: N/A (backend intacto, nenhum compose no repo tocado)
- OTA manifest 200 (updateId 1d1b518f) ✓; APK 1.0.4/versionCode 5 download 200 ✓
- RESULTADO: **PASS**

### Smoke device
PENDENTE — conferir no aparelho após OTA/APK: silhueta real top+bottom+shoes; ordem dress×outerwear; z-fighting; fringe de alpha; fit mangas/ombros/cintura/bico do tênis; fallback shell se template falhar.