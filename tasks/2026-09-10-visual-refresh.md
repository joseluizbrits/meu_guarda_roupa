# Visual Refresh — Modern Vibrante

- **Status:** Done
- **Branch:** task/visual-refresh
- **Goal:** Replace flat/minimal visual language with vibrant, modern design tokens + updated components + consistent styling across all screens. Keep all structure/routes/navigation intact.
- **Context:** App had no design system — ad-hoc colors (`#2f95dc`, `#2e78b7`, `#007AFF`, `#34c759`), no spacing scale, no shadows, flat typography (system font). Components minimal (Button/Input/FormField/CategoryPicker). Visual incoherence between screens.

## Design Direction

- **Vibe:** Moderno vibrante — warm gradient primary, rounded cards with shadow, energetic but not cluttered
- **Palette:** Rose/magenta primary (`#E8467C`) + coral secondary (`#FF7A5C`), warm gray neutrals, proper dark mode
- **Typography:** Poppins (modern sans-serif) replacing system font hierarchy
- **Spacing:** 4px-base scale (4/8/12/16/20/24/32/40/48/64)
- **Radius:** 6 (sm) / 10 (md) / 14 (lg) / 20 (xl) / pill
- **Shadows:** Subtle warm-tinted (`#1A1A2E`), not pure black

## Checklist

- [x] Create design token system — `Colors.ts` + `Theme.ts`
- [x] Update Button — variants (primary/secondary/outline/ghost/danger)
- [x] Update Input — focus states, consistent border radius
- [x] Update CategoryPicker — vibrant selected state, pill shape
- [x] Update FormField + ErrorText with tokens
- [x] Load Poppins font + update root layout + html
- [x] Update login/register screens
- [x] Update closet screen — card thumbnails, selection bar
- [x] Update fitting room — picker with primary border, surface bar
- [x] Update profile screen — card sections, avatar circle, progress bar
- [x] Update onboarding screens — measurements, face-capture, review
- [x] Update wardrobe screens — capture, select-pieces, tag, [id], mask-editor
- [x] Update tab layout — header style, tint colors
- [x] Update +not-found, +html
- [x] QA — tsc clean, web build pass (19 routes)

## Validation

- `npx tsc --noEmit` — ✅ No errors found
- `npx expo export --platform web` — ✅ All 19 routes exported to `dist/`
- Visual: all screens use consistent Poppins font, rose primary, warm neutrals
- Dark mode: Colors.ts has full dark palette, all screens use `Colors[colorScheme]`

## Validation Log
<2026-09-10> tsc: PASS. expo export web: PASS (19 routes).
