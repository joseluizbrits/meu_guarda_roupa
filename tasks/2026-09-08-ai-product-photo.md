# Virtualização de peça: foto de produto via IA + extração com recorte manual

- **Status:** Planning
- **Branch:** task/ai-product-photo-extraction (a criar)
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
- [ ] Backend: `generate_clean_product_photo(image_bytes, mask_bytes=None)` — repassa `mask` no `images.edit` quando presente (arquivo PNG alpha, `io.BytesIO`), mantém fail-open no caso automático.
- [ ] Backend: `POST /api/v1/wardrobe/items/{id}/virtualize` (auth) — body opcional `{mask_asset_id}` (kind `garment_mask`); busca `photo_asset` + mask do MinIO, chama IA, salva asset `garment_ai_photo`, seta `ai_photo_asset_id`, retorna item atualizado (`ai_photo_url`).
  - 503 (sem key) / 400 (mask_asset_id não é do usuário) / 404.
  - Síncrono é ok (gen ~15–40s; mobile mostra spinner). Fazer em `asyncio.to_thread` pra não travar event loop.
- [ ] Backend: schema `AssetKind` + `requestUploadUrl` aceitar `garment_mask`.
- [ ] Mobile: editor de máscara — screen `app/wardrobe/mask-editor.tsx`: recebe `photo_asset_id`/URL, mostra foto + overlay; pincel add/erase (PanResponder ou reutilizar padrão existente); preview cutout ao vivo (extractGarmentCutout); botão "Gerar foto de produto" → `requestUploadUrl('garment_mask')` → upload cutout → `POST .../virtualize` → volta pro detail + refresh.
- [ ] Mobile: `[id].tsx` — botão "Recortar e virtualizar" (foto de pessoa) → mask-editor; mostrar estado de geração (loading) e atualizar `ai_photo_url` quando pronto; mostrar erro 503 legível.
- [ ] Mobile API: `virtualizeWardrobeItem(id, {mask_asset_id})` em `src/core/api/wardrobe.ts`.
- [ ] Ops: usuário preenche `OPENAI_API_KEY` no `infra/.env` + restart backend.

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