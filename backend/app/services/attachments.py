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
from PIL import Image, ImageOps, UnidentifiedImageError

from app.core.config import get_settings

ALLOWED = {"jpg": "JPEG", "jpeg": "JPEG", "png": "PNG", "webp": "WEBP"}
CONTENT_TYPES = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}
MAX_PIXELS = 50_000_000


@dataclass
class StoredImage:
    stored_name: str          # sanitized display copy
    original_filename: str
    content_type: str
    size_bytes: int
    width: int
    height: int
    sha256: str               # of the display copy
    original_stored_name: str  # untouched upload, restricted storage
    original_sha256: str
    original_size_bytes: int
    metadata_removed: dict


GPS_IFD = 0x8825
EXIF_IFD = 0x8769


def sanitize(data: bytes, fmt: str) -> tuple[bytes, dict, tuple[int, int]]:
    """Return a copy with EXIF (incl. GPS), XMP and PNG text chunks removed. EXIF orientation is applied first so the
    visible image is unchanged; the ICC colour profile is kept (it carries no location). PNG is re-encoded losslessly;
    JPEG/WEBP at quality 95."""
    with Image.open(io.BytesIO(data)) as im:
        exif = im.getexif()
        gps = exif.get_ifd(GPS_IFD) if GPS_IFD in exif else {}
        found = {"exif_tags": len(exif) + len(exif.get_ifd(EXIF_IFD) if EXIF_IFD in exif else {}), "gps": bool(gps),
                 "xmp": any(k in im.info for k in ("xmp", "XML:com.adobe.xmp")), "png_text_chunks": sorted(getattr(im, "text", {}) or {}),
                 "comment": "comment" in im.info}
        icc = im.info.get("icc_profile")
        img = ImageOps.exif_transpose(im)  # bake orientation into pixels before dropping the tag
        img.load()
    kw = {"icc_profile": icc} if icc else {}
    out = io.BytesIO()
    if fmt == "JPEG":
        if img.mode not in ("RGB", "L", "CMYK"):
            img = img.convert("RGB")
        img.save(out, "JPEG", quality=95, optimize=True, **kw)
    elif fmt == "PNG":
        img.save(out, "PNG", optimize=True, **kw)  # no pnginfo -> no tEXt/iTXt/zTXt/eXIf chunks
    else:
        img.save(out, "WEBP", quality=95, **kw)
    clean = out.getvalue()
    with Image.open(io.BytesIO(clean)) as chk:  # verify nothing identifying survived
        if len(chk.getexif()) or any(k in chk.info for k in ("exif", "xmp", "XML:com.adobe.xmp", "comment")) or (getattr(chk, "text", None) or {}):
            raise HTTPException(500, "Could not remove image metadata")
        size = chk.size
    return clean, found, size


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


def originals_dir() -> Path:
    return get_settings().attachment_dir / "originals"


def store(validated: list[tuple[UploadFile, bytes, str, int, int]]) -> list[StoredImage]:
    d = get_settings().attachment_dir
    d.mkdir(parents=True, exist_ok=True)
    originals_dir().mkdir(parents=True, exist_ok=True)
    stored: list[StoredImage] = []
    written: list[Path] = []
    try:
        for f, data, fmt, _w, _h in validated:
            ext = "jpg" if fmt == "JPEG" else fmt.lower()
            clean, found, (w, h) = sanitize(data, fmt)
            name, oname = f"{secrets.token_hex(16)}.{ext}", f"{secrets.token_hex(16)}.{ext}"
            for path, payload in ((d / name, clean), (originals_dir() / oname, data)):
                path.write_bytes(payload)
                path.chmod(0o444)
                written.append(path)
            stored.append(StoredImage(name, Path(f.filename or "image").name[:255], CONTENT_TYPES[fmt], len(clean), w, h, hashlib.sha256(clean).hexdigest(),
                                      oname, hashlib.sha256(data).hexdigest(), len(data), found))
    except Exception:
        for p in written:
            try:
                p.chmod(0o644); p.unlink(missing_ok=True)
            except Exception:  # noqa: BLE001
                pass
        raise
    return stored


def path_for(stored_name: str) -> Path:
    p = (get_settings().attachment_dir / stored_name).resolve()
    if p.parent != get_settings().attachment_dir.resolve():  # path traversal guard
        raise HTTPException(404, "Not found")
    return p


def original_path_for(stored_name: str) -> Path:
    base = originals_dir().resolve()
    p = (base / stored_name).resolve()
    if p.parent != base:
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
