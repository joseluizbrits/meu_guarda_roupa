"""AI-generated "clean product photo" for a wardrobe item's raw photo.

Best-effort, fail-open by design (see `wardrobe_service._generate_ai_photo`,
the only caller): any problem here — no API key configured, a network/API
error, an unexpected response shape — returns `None` instead of raising, so
a garment just keeps showing its segmented cutout/raw photo, the same way a
failed on-device segmentation leaves `texture_asset_id` null.
"""

import base64
import io
import logging

from openai import OpenAI
from PIL import Image, ImageDraw, ImageFilter

from app.core.config import settings

logger = logging.getLogger(__name__)

# Verified against the real API with a live key (not just docs — the docs'
# `response_format` param turned out stale/wrong for this model, see below).
# Model names/pricing still shift over time; re-check
# https://platform.openai.com/docs/guides/image-generation if this starts
# failing.
_MODEL = "gpt-image-2"

_PROMPT = (
    "Professional e-commerce product photo of this exact garment, isolated "
    "on a plain white background, no model wearing it, no props, no "
    "wrinkles or folds added — preserve the garment's real color, pattern, "
    "and shape exactly as photographed."
)


def _normalize_mask_square_1024(
    raw: bytes, crop_left: int, crop_top: int, crop_side: int
) -> io.BytesIO:
    """Crop mask with the SAME region used on the image, then resize to
    1024×1024 with NEAREST to preserve hard alpha edges.
    """
    img = Image.open(io.BytesIO(raw)).convert("RGBA")
    img = img.crop((crop_left, crop_top, crop_left + crop_side, crop_top + crop_side))
    img = img.resize((1024, 1024), Image.NEAREST)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return buf


def generate_clean_product_photo(
    image_bytes: bytes, mask_bytes: bytes | None = None
) -> bytes | None:
    if not settings.openai_api_key:
        return None

    try:
        client = OpenAI(api_key=settings.openai_api_key)

        # --- normalize image to 1024×1024 square PNG -----------------
        raw_img = Image.open(io.BytesIO(image_bytes)).convert("RGBA")
        w, h = raw_img.size
        side = min(w, h)
        crop_left = (w - side) // 2
        crop_top = (h - side) // 2
        sq = raw_img.crop((crop_left, crop_top, crop_left + side, crop_top + side))
        sq = sq.resize((1024, 1024), Image.LANCZOS)
        image_file = io.BytesIO()
        sq.save(image_file, format="PNG")
        image_file.seek(0)
        image_file.name = "garment.png"

        # --- optional mask (same crop region, NEAREST resampling) ------
        mask_file = None
        if mask_bytes is not None:
            mask_file = _normalize_mask_square_1024(
                mask_bytes, crop_left, crop_top, side
            )
            mask_file.name = "mask.png"

        # No `response_format` param — this model rejects it outright
        # ("Unknown parameter: 'response_format'", confirmed against the
        # real API); b64_json in the response is just the default.
        kwargs: dict = dict(
            model=_MODEL,
            image=image_file,
            prompt=_PROMPT,
            size="1024x1024",
        )
        if mask_file is not None:
            kwargs["mask"] = mask_file

        result = client.images.edit(**kwargs)
        b64_data = result.data[0].b64_json
        if not b64_data:
            return None
        return base64.b64decode(b64_data)
    except Exception:
        logger.exception("AI clean product photo generation failed")
        return None


# How far a pixel may deviate from the seed color (the flood fill starts at
# the corner, on plain white) and still count as background. Sum of absolute
# differences across RGBA channels (alpha is 255 everywhere in the input).
# ~8/channel: swallows smooth gradient noise while keeping pale garments
# opaque — a garment at 245-gray is only 30 away and still safe; a garment at
# 240-gray (diff 60) is fully protected.
_FLOOD_WHITE_THRESH = 32


def make_transparent_texture(product_photo: bytes) -> bytes:
    """Key the AI clean product photo's plain-white background to transparent
    so the avatar shell can hug the 3D body without rendering a white
    cylinder.

    The AI prompt puts the garment on one contiguous white background, so
    everything reachable from a corner pixel that is still "close to white"
    is background. Anything inside the garment — even white stripes — is
    opaque unless it connects to the border through near-white pixels (a
    genuine hole in the silhouette, which should show the body anyway). Alpha
    edges get a small blur so the 3D mesh doesn't show a hard fringe.

    Pure Pillow, no numpy — runs in a thread for the synchronous virtualize
    endpoint and in the background job otherwise. Failures raise and are
    caught by callers (both treat a missing texture as "keep the cutout").
    """
    img = Image.open(io.BytesIO(product_photo)).convert("RGBA")
    ImageDraw.floodfill(img, (0, 0), (0, 0, 0, 0), thresh=_FLOOD_WHITE_THRESH)

    rgb = img.convert("RGB")
    alpha = img.getchannel("A").filter(ImageFilter.GaussianBlur(0.6))
    rgb.putalpha(alpha)

    buf = io.BytesIO()
    rgb.save(buf, format="PNG")
    buf.seek(0)
    return buf.getvalue()
