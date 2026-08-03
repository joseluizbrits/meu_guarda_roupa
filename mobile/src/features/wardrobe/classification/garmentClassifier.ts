import { Platform } from 'react-native';
import ImageLabeling from '@react-native-ml-kit/image-labeling';

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
];

// Below this, ML Kit's own top label is too unsure to trust either way —
// treated the same as "couldn't classify" (fail open, let segmentation run).
const MIN_CONFIDENCE = 0.4;

export type GarmentClassification = {
  isLikelyGarment: boolean;
  topLabel: string;
  confidence: number;
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

    const isLikelyGarment = labels.some(
      (label) =>
        label.confidence >= MIN_CONFIDENCE &&
        GARMENT_LABEL_KEYWORDS.some((keyword) => label.text.toLowerCase().includes(keyword))
    );

    return { isLikelyGarment, topLabel: top.text, confidence: top.confidence, rawLabels };
  } catch (error) {
    console.warn('[garmentClassifier] classification failed:', error);
    return null;
  }
}
