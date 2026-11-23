"""Complaint photograph storage.

Validation is server-side and content-based: extension allow-list, size limit, count limit, then the bytes must decode
as a real JPEG/PNG/WEBP image (Pillow), which rejects renamed executables, HTML and corrupt files. Pixel count is capped
to block decompression bombs. Files are written to private storage under random names and are never served from a
public web root; only access-checked endpoints stream them.
"""
from __future__ import annotations

import hashlib
import io
import secrets
from dataclasses import dataclass
from pathlib import Path

from fastapi import HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError

from app.core.config import get_settings

ALLOWED = {"jpg": "JPEG", "jpeg": "JPEG", "png": "PNG", "webp": "WEBP"}
CONTENT_TYPES = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}
MAX_PIXELS = 50_000_000


@dataclass
class StoredImage:
    stored_name: str
    original_filename: str
    content_type: str
    size_bytes: int
    width: int
    height: int
    sha256: str


async def validate_images(files: list[UploadFile]) -> list[tuple[UploadFile, bytes, str, int, int]]:
    s = get_settings()
    files = [f for f in files if f is not None and (f.filename or "")]
    if len(files) > s.max_images_per_complaint:
        raise HTTPException(422, f"At most {s.max_images_per_complaint} images can be attached")
    limit = s.max_image_mb * 1024 * 1024
    out = []
    for f in files:
        name = Path(f.filename or "").name
        ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
        if ext not in ALLOWED:
            raise HTTPException(415, f"'{name}': only JPG, JPEG, PNG and WEBP images are accepted")
        data = await f.read(limit + 1)
        if len(data) > limit:
            raise HTTPException(413, f"'{name}' is larger than {s.max_image_mb} MB")
        if not data:
            raise HTTPException(400, f"'{name}' is empty")
        try:
            with Image.open(io.BytesIO(data)) as im:
                fmt = im.format
                w, h = im.size
                if w * h > MAX_PIXELS:
                    raise HTTPException(413, f"'{name}' has too many pixels")
                im.verify()  # structural check
            with Image.open(io.BytesIO(data)) as im2:
                im2.load()  # full decode - catches truncated / corrupt data
        except HTTPException:
            raise
        except (UnidentifiedImageError, OSError, SyntaxError, ValueError, Image.DecompressionBombError):
            raise HTTPException(415, f"'{name}' is not a valid image file")
        if fmt not in CONTENT_TYPES:
            raise HTTPException(415, f"'{name}': only JPG, PNG and WEBP images are accepted")
        out.append((f, data, fmt, w, h))
    return out


def store(validated: list[tuple[UploadFile, bytes, str, int, int]]) -> list[StoredImage]:
    d = get_settings().attachment_dir
    d.mkdir(parents=True, exist_ok=True)
    stored: list[StoredImage] = []
    try:
        for f, data, fmt, w, h in validated:
            ext = "jpg" if fmt == "JPEG" else fmt.lower()
            name = f"{secrets.token_hex(16)}.{ext}"
            p = d / name
            p.write_bytes(data)
            p.chmod(0o444)
            stored.append(StoredImage(name, Path(f.filename or "image").name[:255], CONTENT_TYPES[fmt], len(data), w, h, hashlib.sha256(data).hexdigest()))
    except Exception:
        remove([s.stored_name for s in stored])
        raise
    return stored


def path_for(stored_name: str) -> Path:
    p = (get_settings().attachment_dir / stored_name).resolve()
    if p.parent != get_settings().attachment_dir.resolve():  # path traversal guard
        raise HTTPException(404, "Not found")
    return p


def remove(names: list[str]) -> None:
    for n in names:
        try:
            p = path_for(n)
            p.chmod(0o644)
            p.unlink(missing_ok=True)
        except Exception:  # noqa: BLE001
            pass
