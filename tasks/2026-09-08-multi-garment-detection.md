# Detecção de múltiplas peças numa foto (extrair + escolher → closet)

- **Status:** Done
- **Branch:** task/multi-garment-detection (fork de task/ai-product-photo-extraction / PR #4 para manter cadeia mergável)
- **Goal:** Foto de pessoa com várias peças → detecta cada peça com tipo + caixa (gpt-4o vision), mostra grid com recortes, usuário escolhe quais manter; cada peça escolhida vira 1 item no closet (recorte transparente + foto de produto IA automática), categoria pré-preenchida editável.
- **Context / descobertas:**
  - Hoje o pipeline é single-garment: U2Net local segmenta **1 objeto saliente** (`tfliteSegmentationEngine`), 1 item por foto (`create_item`), sem batch/origem no DB.
  - Decisões do usuário: (1) detecção = **gpt-4o vision na nuvem + U2Net local por caixa**; (2) peças escolhidas **viram item no closet**; (3) categoria **automática editável**.
  - Docs OpenAI (Context7, openai-python v2): `client.chat.completions.parse(model, messages=[...image_url base64 data URL...], response_format=PydanticModel)` — vision + structured outputs OK no gpt-4o-2024-08-06.
  - Debates com @backend/@frontend:
    - **bbox deve ser objeto** `NormalizedBox{x_min,y_min,x_max,y_max}` — `list[float]` quebra strict structured outputs (sem minItems/prefixItems).
    - `category` em `str` + validação server-side (mapear desconhecido → accessory) — Literal puro derruba a chamada inteira em roupa fora do enum.
    - I/O bloqueante (s3 + OpenAI) em `asyncio.to_thread` (endpoint síncrono user-facing).
    - Endpoint `POST /wardrobe-items/detect` declarado **antes** de `/{item_id}` (hygiene; `{item_id}` é uuid — aberto em GET/PATCH/DELETE, detect é POST, mas previne 422 futuro).
    - Mobile: passar photoUri/detections por **store** (param de rota serializa URL gigante — crash); thumbnails do grid via crop Skia **256px** (perf N>6); U2Net por peça em **paralelo** com `Promise.allSettled` no confirm (um falhar não bloqueia os outros); guarda `Platform.OS !== 'web'` (U2Net é native-only, web cai pra crop retangular).
    - 503 sem key / 502 falha API — explícitos (não fail-open silencioso em ação do usuário).
  - Reuso máximo: `garment_photo` já existe (item photo = cutout PNG da peça); `ai_photo` automático já roda no `create_item`; CategoryPicker reutilizável; `extractGarmentCutout` + `loadSkia` já existem. **Zero mudança de schema DB.** Custo detect ~$0.01–0.02/chamada (gpt-4o, high detail).

## Checklist
- [x] Backend: `app/services/detection_service.py` — `detect_garments(image_bytes)`; pydantic `DetectionResult{pieces}`, `GarmentPiece{label, category: str, box: NormalizedBox, confidence}`; prompt PT-BR; categoria fora do enum → `accessory`.
- [x] Backend: `POST /api/v1/wardrobe-items/detect` (auth) — ownership check (404 sem leak); s3+OpenAI em `asyncio.to_thread` (closure sync, não async); 503 (sem key) / 502; rota declarada ANTES de `/{item_id}`.
- [x] Backend: schema `WardrobeItemDetectRequest`.
- [x] Mobile API: `detectGarments(photoAssetId)` + tipos em `src/core/api/wardrobe.ts`.
- [x] Mobile store: `capturedGarmentPhotoStore` estendido (`detections`, `photoAssetId`, `setDetections`) — sem params de rota.
- [x] Mobile `app/wardrobe/tag.tsx`: botão "Detectar várias peças" → upload `garment_photo` → detect → store → select-pieces.
- [x] Mobile `app/wardrobe/select-pieces.tsx`: grid 2 colunas (thumb 256px via Skia crop bbox), checkbox manter/remover, CategoryPicker pré-preenchido; estados 0/N, erro, retry.
- [x] Mobile confirm: crop full-res → U2Net paralelo `allSettled` → cutout (fallback crop se web/falha) → upload `garment_photo` → `createWardrobeItem` sequencial; progresso; sucesso parcial reportado; `router.replace('/closet')`.
- [x] QA: tsc limpo; E2E live PASS (2 peças detectadas conf .95, 2 itens criados, ai_photo_url ambos, 404 cross-user).

## Validation
```bash
cd mobile && npx tsc --noEmit
python3 -m py_compile backend/app/services/detection_service.py backend/app/api/v1/wardrobe.py backend/app/schemas/wardrobe_item.py
# E2E live (key configurada): upload foto de pessoa c/ 2 peças → POST /wardrobe-items/detect → pieces>=2 com box+categoria
#   → por peça: POST /assets/upload-url garment_photo → PUT presigned → POST /wardrobe-items (category da peça)
#   → aguardar ~45s → GET items → cada um com ai_photo_url (PNG 1024²)
# Negativos: detect sem key (503) validado por teste de código (key presente em prod); photo_asset alheio → 403/404.
```

## Why not continued
(não preenchido — sessão ativa)

## Notas validadas (não-bloqueantes, do @plan-validator)
- Orphan do `garment_photo` original (upload pra detect) se fluxo abandonado/0 peças: **débito técnico aceito** (leak pequeno; cleanup futura).
- Confirm flow precisa explicitar: crop bbox → **encode PNG → arquivo cache → URI** (padrão `extractGarmentCutout`), depois `segment(cropUri)`.
- S3 fetch + OpenAI ambos dentro do `asyncio.to_thread` (não copiar padrão pior do `virtualize_item`, que põe S3 no coroutine).

## Validation Log
- 2026-09-08 E2E live (stack rebuildado; openai SDK v3.8.0 no container — `.parsed` fica em `choices[0].message.parsed`, não no completion): foto sintética 2 peças → detect 200, 2 peças (`camiseta` top conf 0.95, `calça` bottom conf 0.95, boxes precisas); crop+create item por peça → ambos 201; `ai_photo_url` populado nos 2 (50s); cleanup 204; detect com asset de outro usuário → 404. Todos PASS.
- Mobile: `npx tsc --noEmit` → No errors found. Backend: `python3 -m py_compile` → OK.
- Detalhe SDK v3: corrigido em `detection_service.py` (v1/v2 docs falam `message.parsed`; v3 real = `message.choices[0].message.parsed`).

(—)