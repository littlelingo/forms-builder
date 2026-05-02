from __future__ import annotations

from io import BytesIO

import fitz


def render_conversion_page_png(payload: bytes, page_number: int, *, scale: float = 1.75) -> bytes:
    document = fitz.open(stream=payload, filetype="pdf")
    try:
        if page_number < 1 or page_number > document.page_count:
            raise ValueError("Requested page is out of bounds.")
        page = document[page_number - 1]
        matrix = fitz.Matrix(scale, scale)
        pixmap = page.get_pixmap(matrix=matrix, alpha=False)
        return pixmap.tobytes("png")
    finally:
        document.close()
