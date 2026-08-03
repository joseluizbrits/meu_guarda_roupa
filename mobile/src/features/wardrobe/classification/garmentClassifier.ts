import { Platform } from 'react-native';
import ImageLabeling from '@react-native-ml-kit/image-labeling';

import type { WardrobeCategory } from '@/src/core/api/wardrobe';

/**
 * Gate in front of the (expensive, 44MB-model) segmentation step: uses
 * Google ML Kit's bundled generic on-device image labeler — no custom
 * model file to manage, unlike `tfliteSegmentationEngine.ts` — to check
 * whether a photo plausibly shows a piece of clothing before spending
 * battery/time running U2Net on it.
 *
 * ML Kit's base labeler returns free-text labels from its own internal
 * (Google-proprietary, ~400-label) vocabulary — there's no published
 * canonical list, so `GARMENT_LABEL_KEYWORDS` below is a best-effort
 * allowlist of common apparel/footwear/accessory terms, not a verified
 * exact match against the model's real label set. `classifyGarmentPhoto`
 * logs every raw label it gets back specifically so this list can be
 * tuned against real device output instead of guessed twice.
 */

const GARMENT_LABEL_KEYWORDS = [
  'clothing',
  'shirt',
  't-shirt',
  'blouse',
  'sweater',
  'sweatshirt',
  'hoodie',
  'cardigan',
  'jacket',
  'coat',
  'outerwear',
  'jeans',
  'trousers',
  'pants',
  'shorts',
  'skirt',
  'dress',
  'suit',
  'sportswear',
  'swimwear',
  'undergarment',
  'nightwear',
  'sleeve',
  'collar',
  'footwear',
  'shoe',
  'sneaker',
  'boot',
  'sandal',
  'hat',
  'cap',
  'scarf',
  'glove',
  // A real garment photo (fabric filling most of the frame — a common
  // shot for a shirt lying flat/hung close-up) can come back from ML Kit
  // with NO label more specific than this: e.g. a real "top" photo this
  // session returned only `Textile (0.77)`, `Pattern (0.74)`. Without
  // these, the gate wrongly skipped segmentation on an actual garment.
  'textile',
  'pattern',
];

// A keyword match above can still be wrong for a specific, previously-seen
// case: a pillow photo matched 'textile' via `Textile`/`Cushion` labels.
// Rather than dropping 'textile' again (breaking the real garment case
// above), this overrides the match back to "not a garment" only when one
// of these more specific non-garment nouns is also present. Deliberately
// narrow — broader environment words (asphalt, road, soil...) are NOT
// here: a real "shorts photographed outdoors" garment photo this session
// legitimately included `Asphalt`/`Sand`, so excluding on those would
// reintroduce the same class of bug this is meant to fix.
const NON_GARMENT_OVERRIDE_KEYWORDS = ['pillow', 'cushion'];

// Below this, ML Kit's own top label is too unsure to trust either way —
// treated the same as "couldn't classify" (fail open, let segmentation run).
const MIN_CONFIDENCE = 0.4;

// Maps a label to one of the app's own 6 wardrobe categories, for
// pre-selecting `CategoryPicker` on the tag screen — a suggestion the user
// can freely override, not a gate, so this can afford to be a bit more
// specific/narrower than `GARMENT_LABEL_KEYWORDS` above (a miss here just
// means nothing gets pre-selected, not that segmentation gets skipped).
// Checked in this order; the first category with a matching label wins.
const CATEGORY_LABEL_KEYWORDS: [WardrobeCategory, string[]][] = [
  ['dress', ['dress', 'gown', 'kimono']],
  ['outerwear', ['jacket', 'coat', 'blazer', 'outerwear']],
  ['shoes', ['footwear', 'shoe', 'sneaker', 'boot', 'sandal']],
  ['accessory', ['hat', 'cap', 'scarf', 'glove']],
  ['bottom', ['jeans', 'trousers', 'pants', 'shorts', 'skirt', 'denim']],
  ['top', ['shirt', 't-shirt', 'blouse', 'sweater', 'sweatshirt', 'hoodie', 'cardigan', 'jersey']],
];

function suggestCategory(labels: { text: string; confidence: number }[]): WardrobeCategory | null {
  const sorted = [...labels].sort((a, b) => b.confidence - a.confidence);
  for (const label of sorted) {
    if (label.confidence < MIN_CONFIDENCE) {
      continue;
    }
    const text = label.text.toLowerCase();
    const match = CATEGORY_LABEL_KEYWORDS.find(([, keywords]) => keywords.some((keyword) => text.includes(keyword)));
    if (match) {
      return match[0];
    }
  }
  return null;
}

export type GarmentClassification = {
  isLikelyGarment: boolean;
  topLabel: string;
  confidence: number;
  // Best-guess category from the same labels, for pre-selecting
  // `CategoryPicker` — `null` when nothing in `CATEGORY_LABEL_KEYWORDS`
  // matched (still a valid outcome; the user just picks manually).
  suggestedCategory: WardrobeCategory | null;
  // Full ML Kit output (not just the label(s) the gate acted on) — kept so
  // callers can persist it for retraining/tuning later, per
  // `GarmentMlAnalysisPayload` in `core/api/wardrobe.ts`.
  rawLabels: { text: string; confidence: number }[];
};

/**
 * Returns `null` on web (no native ML Kit) or if classification fails for
 * any reason — callers should treat `null` the same as "unknown, don't
 * skip segmentation over it" (fail open; this is a battery-saving
 * optimization, not a correctness gate).
 */
export async function classifyGarmentPhoto(imageUri: string): Promise<GarmentClassification | null> {
  if (Platform.OS === 'web') {
    return null;
  }

  try {
    const labels = await ImageLabeling.label(imageUri);
    console.log('[garmentClassifier] raw ML Kit labels:', labels.map((l) => `${l.text} (${l.confidence.toFixed(2)})`));

    if (labels.length === 0) {
      return null;
    }

    const rawLabels = labels.map((label) => ({ text: label.text, confidence: label.confidence }));

    const top = labels.reduce((best, label) => (label.confidence > best.confidence ? label : best));
    if (top.confidence < MIN_CONFIDENCE) {
      return null;
    }

    const matchesKeyword = (keywords: string[]) =>
      labels.some(
        (label) =>
          label.confidence >= MIN_CONFIDENCE && keywords.some((keyword) => label.text.toLowerCase().includes(keyword))
      );

    const isLikelyGarment =
      matchesKeyword(GARMENT_LABEL_KEYWORDS) && !matchesKeyword(NON_GARMENT_OVERRIDE_KEYWORDS);

    return {
      isLikelyGarment,
      topLabel: top.text,
      confidence: top.confidence,
      suggestedCategory: suggestCategory(labels),
      rawLabels,
    };
  } catch (error) {
    console.warn('[garmentClassifier] classification failed:', error);
    return null;
  }
}
