# Virtualização de peça: foto de produto via IA + extração com recorte manual

- **Status:** Validated
- **Branch:** task/ai-product-photo-extraction
- **Goal:** Usuário manda foto de peça (avulsa) OU de pessoa vestindo; app gera a "foto de produto" limpa da peça (fundo neutro, sem pessoa) via IA e mostra no closet.
- **Context / descoberta:** O backend JÁ TEM o pipeline completo, só adormecido pela key vazia:
  - `wardrobe_service._generate_ai_photo(item_id)` — background task disparada no save do item.
  - `ai_image_service.generate_clean_product_photo(image_bytes)` — `gpt-image-2`, prompt de e-commerce product photo, fail-open (None se sem key/erro).
  - Asset `garment_ai_photo` + `item.ai_photo_asset_id`, response já expõe `ai_photo_url`.
  - Mobile `app/wardrobe/[id].tsx` JÁ mostra `ai_photo_url ?? texture_url ?? photo_url`.
  - Docs OpenAI (SDK v2): `images.edit` tem params `mask`, `background`, `input_fidelity`. Semântica da mask: região **transparente = área a (re)gerar**; opaca = preservar.
- **Lacunas reais:** (1) `OPENAI_API_KEY` vazia no infra/.env. (2) Foto de pessoa vestindo: hoje manda a foto crua → gpt-image-2 vai inventar/tentar remover a pessoa sem isolamento da peça → ruim. Precisa recorte manual da peça (escolha do usuário). (3) Trigger: só existe automático no save; falta ação explícita "virtualizar" no detail para o caso pessoa.
- **Decisões:**
  - Mecanismo: **AI product photo** (escolhida pelo usuário). Sem avatar, sem VTO.
  - Extração: **recorte manual primeiro** — foto de pessoa → editor de máscara (pincel adicionar/remover) → cutout PNG alpha (reusa `extractGarmentCutout`) → vira `mask` da OpenAI.
  - Foto de peça avulsa: fluxo atual automático no save continua (sem mask).
  - API: `images.edit(image=foto_original, mask=cutout_alpha, prompt=produto, size=1024)` — mask transparente fora da peça → IA regenera fundo/pessoa pra estúdio neutro, peça preservada.
  - Custo: ~US$0.04–0.19/imagem (gpt-image-2), documentar. Sem key → 503 claro "configure OPENAI_API_KEY" (não fail-open silencioso nesse endpoint explícito).

## Checklist
- [x] Backend: `generate_clean_product_photo(image_bytes, mask_bytes=None)` — repassa `mask` no `images.edit` quando presente (arquivo PNG alpha, `io.BytesIO`), mantém fail-open no caso automático. + normalização Pillow: crop quadrado + resize 1024x1024 na imagem E na mask (mesma região, NEAREST).
- [x] Backend: `POST /api/v1/wardrobe/items/{id}/virtualize` (auth) — body opcional `{mask_asset_id}` (kind `garment_mask`); busca `photo_asset` + mask do MinIO, chama IA, salva asset `garment_ai_photo`, seta `ai_photo_asset_id`, retorna item atualizado (`ai_photo_url`).
  - 503 (sem key) / 400 (mask_asset_id não é do usuário) / 404 / 502 (falha IA).
  - Síncrono com `asyncio.to_thread` (IA+storage em thread, DB fora da thread).
- [x] Backend: schema `AssetKind` + `requestUploadUrl` aceitar `garment_mask`.
- [x] Mobile: editor de máscara — screen `app/wardrobe/mask-editor.tsx`: mostra foto + overlay; pincel add/erase (PanResponder); snapshot PNG alpha nas dimensões originais; upload `garment_mask`; `POST .../virtualize`; volta pro detail + refresh. Preview cutout ao vivo: substituído por overlay de pintura (cobertura visível via pincel).
- [x] Mobile: `[id].tsx` — botão "Gerar foto de produto" → mask-editor.
- [x] Mobile API: `virtualizeWardrobeItem(id, {mask_asset_id})` em `src/core/api/wardrobe.ts`.
- [x] Ops: `OPENAI_API_KEY` preenchida no `infra/.env` + restart backend (feito na sessão anterior).

## Validation
```bash
# backend sem key: POST virtualize → 503 mensagem clara (testar antes de pôr a key)
# com key (E2E):
#   1. upload foto de pessoa → item criado (ai_photo_asset_id null ou com resultado automático)
#   2. recorte manual → upload garment_mask → POST virtualize {mask_asset_id}
#   3. resposta 200 com ai_photo_url; baixar ai_photo_url → PNG, peça com fundo neutro, sem pessoa
#   (inspeção visual humana — não dá pra automatizar qualidade)
python3 -m py_compile backend/app/api/v1/wardrobe.py backend/app/services/ai_image_service.py
cd mobile && npx tsc --noEmit
```

## Why not continued
Pausado aguardando decisão de implementação + key OpenAI do usuário. Retomar: criar branch task/ai-product-photo-extraction, rodar checklist começando pelo backend (mask param + endpoint), depois mask-editor mobile, depois QA.

## Validation Log
- 2026-09-08 E2E (stack rebuildado, Pillow instalado): register/login OK; foto não-quadrada 900x1200 → auto ai_photo_url em ~45s, PNG 1024x1024; `POST virtualize {}` → 200 em 15.1s; `POST virtualize {mask_asset_id}` → 200 em 14.2s (asset substituído); máscara kind `garment_texture` como mask → 400; cleanup delete 204. Todos PASS.
- Mobile: `npx tsc --noEmit` → No errors found.
### 2026-09-08T02:36:47.453Z

- `bash` → SKIPPED (not in allowlist)

- `python3 -m py_compile backend/app/api/v1/wardrobe.py backend/app/services/ai_image_service.py` → SKIPPED (not in allowlist)

- `cd mobile && npx tsc --noEmit` → SKIPPED (not in allowlist)
