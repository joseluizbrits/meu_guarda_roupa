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


def generate_clean_product_photo(image_bytes: bytes) -> bytes | None:
    if not settings.openai_api_key:
        return None

    try:
        client = OpenAI(api_key=settings.openai_api_key)
        image_file = io.BytesIO(image_bytes)
        image_file.name = "garment.png"
        # No `response_format` param — this model rejects it outright
        # ("Unknown parameter: 'response_format'", confirmed against the
        # real API); b64_json in the response is just the default.
        result = client.images.edit(
            model=_MODEL,
            image=image_file,
            prompt=_PROMPT,
            size="1024x1024",
        )
        b64_data = result.data[0].b64_json
        if not b64_data:
            return None
        return base64.b64decode(b64_data)
    except Exception:
        logger.exception("AI clean product photo generation failed")
        return None
