"""Server-side garment detection via OpenAI gpt-4o vision + structured outputs.

Called from the route inside asyncio.to_thread — this module is intentionally
synchronous (blocking I/O).
"""

import base64
import logging

from openai import OpenAI

from app.core.config import settings
from app.schemas.wardrobe_item import GarmentPiece

logger = logging.getLogger(__name__)

_VALID_CATEGORIES = {"top", "bottom", "dress", "outerwear", "shoes", "accessory"}

_SYSTEM_PROMPT = (
    "You are a fashion detection assistant. The photo may contain MULTIPLE "
    "people and MULTIPLE garments per person. Your job is to exhaustively "
    "detect EVERY distinct garment visible, for EVERY person in the frame, "
    "top-to-bottom: top (shirt/t-shirt/blouse), bottom (pants/jeans/shorts/"
    "skirt), dress, outerwear (jacket/coat), shoes, accessories (bag/hat/"
    "scarf/jewelry). Never include the person, face, hands, skin, or "
    "background objects. IMPORTANT: do not skip lower-body garments — if a "
    "bottom (pants/skirt/shorts) is visible even partially or behind a person, "
    "detect it. When several people repeat the same garment type, still return "
    "one bbox per person's garment (do not merge). For each piece return a "
    "tight bounding box around just that garment, normalized 0..1 (x_min,y_min "
    "top-left; x_max,y_max bottom-right), label in Portuguese (e.g. "
    "'camiseta', 'calça jeans', 'tênis'), category exactly one of: top, "
    "bottom, dress, outerwear, shoes, accessory. If a garment is not clearly "
    "one of these, use the closest. Ignore anything not a distinct garment. "
    "If nothing wearable is clearly visible, return an empty pieces list."
)

_USER_MESSAGES = [
    {"type": "text", "text": "Detecte as peças de vestuário nesta foto."},
]

_MODEL = "gpt-4o-2024-08-06"


class AiKeyMissingError(Exception):
    """OPENAI_API_KEY not configured — route maps this to 503."""


def detect_garments(image_bytes: bytes) -> list[GarmentPiece]:
    if not settings.openai_api_key:
        raise AiKeyMissingError(
            "OPENAI_API_KEY not configured on the server — cannot detect garments."
        )

    client = OpenAI(api_key=settings.openai_api_key)

    data_url = "data:image/png;base64," + base64.b64encode(image_bytes).decode()

    messages = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {
            "role": "user",
            "content": [
                *_USER_MESSAGES,
                {
                    "type": "image_url",
                    "image_url": {"url": data_url, "detail": "high"},
                },
            ],
        },
    ]

    # Import the schema at call time so the module-level import of
    # DetectionResult is only needed once the schemas module is stable.
    from app.schemas.wardrobe_item import DetectionResult

    message = client.chat.completions.parse(
        model=_MODEL,
        messages=messages,
        response_format=DetectionResult,
    )

    # openai SDK v3 (as installed in the container) puts the parsed Pydantic
    # object on choices[0].message.parsed — not on the completion itself.
    parsed = message.choices[0].message.parsed
    if parsed is None or not hasattr(parsed, "pieces") or parsed.pieces is None:
        raise RuntimeError("OpenAI returned empty or unparsed response")

    # Map unknown categories → "accessory"
    pieces: list[GarmentPiece] = []
    for p in parsed.pieces:
        cat = p.category if p.category in _VALID_CATEGORIES else "accessory"
        pieces.append(
            GarmentPiece(
                label=p.label,
                category=cat,
                box=p.box,
                confidence=p.confidence,
            )
        )

    return pieces
