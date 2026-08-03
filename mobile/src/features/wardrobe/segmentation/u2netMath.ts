/**
 * Pure quantize/dequantize math for `assets/models/u2net_full_integer_quant.tflite`.
 * No React Native / Skia / TFLite imports on purpose: this file is exercised
 * directly with plain `node` (see the repo's verification notes) since the
 * actual on-device inference can't be run in this environment.
 *
 * Numbers below (tensor shapes, quantization scale/zero-point, the
 * ImageNet mean/std) come straight from the model's own FlatBuffer schema
 * and are NOT guesses:
 * - Input tensor `inputs_0`: `[1, 320, 320, 3]`, INT8,
 *   `scale=0.01865844801068306, zero_point=-14`.
 * - The 7 output tensors are all `[1, 320, 320, 1]`, INT8,
 *   `scale=0.00390625, zero_point=-128` — same quantization for all 7, but
 *   only `Identity` (U2Net's fused `d0` saliency map) matters; `Identity_1`
 *   through `Identity_6` are training-only deep-supervision side outputs.
 * - The input quantization's real-value range (`(-128+14)*0.018658 ≈
 *   -2.13` to `(127+14)*0.018658 ≈ 2.63`) matches ImageNet-normalized pixel
 *   ranges almost exactly, confirming standard ImageNet mean/std
 *   normalization was baked in before quantization.
 */

export const U2NET_INPUT_SIZE = 320;

/** ImageNet per-channel mean, in R, G, B order. */
export const IMAGENET_MEAN: readonly [number, number, number] = [0.485, 0.456, 0.406];
/** ImageNet per-channel std, in R, G, B order. */
export const IMAGENET_STD: readonly [number, number, number] = [0.229, 0.224, 0.225];

export const INPUT_QUANT = {
  scale: 0.01865844801068306,
  zeroPoint: -14,
} as const;

export const OUTPUT_QUANT = {
  scale: 0.00390625,
  zeroPoint: -128,
} as const;

/** The only output tensor that matters — see the module doc comment above. */
export const OUTPUT_TENSOR_NAME = 'Identity';

function clampInt8(value: number): number {
  return Math.max(-128, Math.min(127, value));
}

/**
 * Converts one channel of one pixel — given as a plain `[0, 1]` float
 * (i.e. the raw `0-255` byte already divided by 255) — into the quantized
 * int8 value the model's input tensor expects.
 *
 * `channel` is 0 = R, 1 = G, 2 = B, matching `IMAGENET_MEAN`/`IMAGENET_STD`.
 */
export function quantizeInputChannel(value01: number, channel: 0 | 1 | 2): number {
  const normalized = (value01 - IMAGENET_MEAN[channel]) / IMAGENET_STD[channel];
  const quantized = Math.round(normalized / INPUT_QUANT.scale) + INPUT_QUANT.zeroPoint;
  return clampInt8(quantized);
}

/**
 * Dequantizes one value from the `Identity` output tensor into a `[0, ~1]`
 * foreground/saliency alpha. No sigmoid needed — it's already baked into
 * the quantized output range (int8 -128 -> 0, int8 127 -> ~0.996).
 */
export function dequantizeOutputAlpha(int8Value: number): number {
  const real = OUTPUT_QUANT.scale * (int8Value - OUTPUT_QUANT.zeroPoint);
  return Math.max(0, Math.min(1, real));
}
