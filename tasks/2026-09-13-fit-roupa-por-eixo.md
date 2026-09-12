# Fit de roupa por eixo — corrige roupa flutuando em volta do boneco

- **Status:** Validated
- **Branch:** task/fit-roupa-por-eixo
- **Goal:** Roupa veste o corpo de verdade: sem gap visível frente/trás, sem "duas imagens" (frente+atrás do template transparente), shoes cobrindo pé até o bico. Correção pura frontend (TS) + distribuição por OTA.
- **Context:** APK 1.0.4 já tem malhas-template 3D (garmentTemplate.ts). User confirmou smoke no device: roupa flutua em volta do boneco, lê "duas imagens, não peça 3D". Causa raiz medida (números do BaseHuman.glb via THREE loader):
  - **Context histórico (números de banda larga, APROXIMADOS — constantes finais vêm do script, item 16):** body torso z −0.094..+0.145, chest ±0.449 incl deltoide, waist ±0.208, hips ±0.22. Validator refutou estes como exatos (deltoide varre ±0.80 em y1.05–1.15; costela ±0.42 em y1.35; quadril centerZ real ≈0.003–0.019). Medir pelo script.
  - Templates authorados GORDOS: dress cross-section 0.44×0.44 (quadrado), top 0.44×0.35, outerwear 0.46×0.37, bottom 0.39×0.304.
  - `garmentTemplate.ts` escala UNIFORME (`setScalar(scale)`) preserva proporção gorda + centra em `spine02.z = −0.0182` (0.04 atrás do centro real) → peça sobrepassa corpo frente/trás + transparente com depthWrite false mostra as DUAS faces = "duas imagens".
  - Shoes: template z-range [−0.0097, 0.1701] vs pé real [0.0065, 0.1539] → calcanhar flutua, bico passa.
- **Decisões:** (1) user escolheu "Fit por eixo"; (2) debatido com @frontend: constantes hardcoded do corpo (rig congelado — BaseHuman nunca muda; re-author de templates fica fora deste pass) + centro Z por faixa; (3) @backend confirmou: backend zero mudanças; (4) `checkAutomatically: "NEVER"` → NÃO dá push automático. Fix é JS puro → **mantém `versionCode` 5**, bump versão 1.0.5, distribui por **OTA** (`publish-update.sh`), user toca "Verificar atualização" no app. NÃO dobrar bump versionCode+OTA (caminho APK força, pula OTA). NUNCA tocar `runtimeVersion`.

## Checklist
- [ ] Branch `task/fit-roupa-por-eixo` criada a partir de `task/garment-template-mesh` (HEAD d4fce10) e **pusheada**
- [ ] **Script novo `mobile/scripts/measure-body-metrics.mjs`**: parseia BaseHuman.glb (GLTFLoader), mede por faixa Y do mesh: envelope X (sem filtro — inclui braço/deltoide p/ cobertura de manga), envelope Z front/back, centroZ real por faixa; imprime tabela de constantes. **Emitir janelas de largura nomeadas: `shoulders+arms` (p/ top/outerwear X) e `shoulders-only` (p/ dress X)**. Método documentado no próprio script + tabela no Validation Log (proveniência: nada hardcoded sem medição)
- [ ] Constantes derivadas do script acima em `garmentTemplate.ts` (bloco `BODY_METRICS` + comentário "atualizar se BaseHuman.glb mudar") — NÃO usar 0.898/0.416/0.239 de análise anterior: foram aproximações de banda larga, refutadas pelo validator (deltoide ±0.80 em y1.05–1.15; costela ±0.42 em y1.35; quadril centerZ real ≈0.003–0.019, não 0.0275)
- [ ] `fitTorso` (top/outerwear): escala por eixo — scaleY = targetHeight/geoHeight; scaleX = largura ombros+braço/geoWidth (faixa peito Y alta, o que a manga precisa COBRIR — senão braço fura a manga); scaleZ = profundidade faixa peito/geoDepth; centroZ = centerZ da faixa peito (NÃO spine02.z = −0.0182)
- [ ] `fitTorso` dress: scaleX = largura ombros/geoWidth (flare authorado preserva quadril), scaleZ = profundidade faixa QUADRIL/geoDepth, centroZ = centerZ quadril
- [ ] `fitBottom` (Definitivo: faixa QUADRIL apenas): scaleX = largura quadril/geoWidth, scaleZ = profundidade quadril/geoDepth, centroZ = centerZ quadril; NADA de blend cintura+quadril (simples, cobre quadril que é o que calça veste)
- [ ] `fitShoe`: escalar Z p/ cobrir exatamente [foot.z, toes.z] (0.0065 → 0.1539) e centrar em (foot.z+toes.z)/2 — calcanhar flutuando + bico curto; claim do template z-range move pra comentário do fit (era pós-fit, não geometria crua)
- [ ] `app.json`: version "1.0.5" (versionCode PERMANECE 5 — OTA, não APK)
- [ ] `cd mobile && npx tsc --noEmit` limpo
- [ ] `scripts/publish-update.sh` → exit 0 + updateId novo visível em `/api/updates/manifest` (device checa ESSE, não `/api/v1/app/latest`)
- [ ] **Manifest.json do backend NÃO é tocado** (só build-apk.sh reescreve; `/api/v1/app/latest` continua 1.0.4/version_code 5 por design — assertion removida)
- [ ] Smoke user: atualizar via app (Profile → Verificar atualização → Reiniciar), rotacionar avatar top+bottom+dress+outerwear+shoes: sem gap frente/trás, sem "duas imagens", BRAÇO não fura manga, shoes no pé
- [ ] Se OTA falhar no device → fallback: `scripts/build-apk.sh` APK 1.0.5/versionCode 6 sideload manual

## Subtasks
- **frontend:** `garmentTemplate.ts` fit por eixo + constantes + z-centering + fitShoe; bump versão; publish OTA
- **backend:** nenhuma mudança (confirmado — serving estático arquivo-based; manifest.json reescrito pelo script)
- **qa:** tsc --noEmit + publish-update manifest 200 + conferir app/latest; validar que versionCode não subiu

## Validation
- `node mobile/scripts/measure-body-metrics.mjs` → imprime tabela de constantes (fonte da verdade; conferir números no Validation Log)
- `cd mobile && npx tsc --noEmit`
- `bash scripts/publish-update.sh` → exit 0 + updateId novo em `/api/updates/manifest` (checagem real do device)
- `curl -sf https://guardaroupa.rafaelferro.dev/api/v1/app/latest` → **continua** 1.0.4 / version_code 5 (esperado — OTA não reescreve manifest; assertion de 1.0.5 REMOVIDA)
- Smoke device (user): 5 categorias vestidas, sem float/gap/duas-imagens, braço não fura manga, shoes no pé

## Why not continued
<não pausado>

## Validation Log
<vazio — aguardando QA + smoke user>