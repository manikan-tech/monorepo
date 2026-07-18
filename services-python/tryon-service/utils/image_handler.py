# Temporary image validation, storage, download, and cleanup utilities.
import logging
import os
import shutil
import uuid
from pathlib import Path

import requests
from fastapi import UploadFile
from PIL import Image, ImageOps

logger = logging.getLogger(__name__)
MIN_HUMAN_IMAGE_WIDTH = 400
MIN_HUMAN_IMAGE_HEIGHT = 600
MIN_GARMENT_IMAGE_WIDTH = 300
MIN_GARMENT_IMAGE_HEIGHT = 300


def _decode_and_validate_image(
    source: object,
    *,
    label: str,
    min_width: int,
    min_height: int,
) -> Image.Image:
    """Decode an image and reject tiny or badly cropped inputs early."""
    try:
        image = ImageOps.exif_transpose(Image.open(source))
        image.load()
    except (OSError, SyntaxError) as error:
        raise ValueError("Image data could not be decoded.") from error

    width, height = image.size
    if width < min_width or height < min_height:
        raise ValueError(
            f"{label} is too small. Minimum size is {min_width}x{min_height}px, "
            f"but received {width}x{height}px."
        )

    return image


def save_upload_to_temp(upload_file: UploadFile, temp_dir: str) -> str:
    """Validate and save an uploaded image as a temporary RGB JPEG."""
    content_type = upload_file.content_type or ""
    if not content_type.startswith("image/"):
        raise ValueError("human_image must have an image content type.")

    destination = Path(temp_dir) / f"{uuid.uuid4()}.jpg"
    try:
        _save_as_rgb_jpeg(
            upload_file.file,
            destination,
            label="human_image",
            min_width=MIN_HUMAN_IMAGE_WIDTH,
            min_height=MIN_HUMAN_IMAGE_HEIGHT,
        )
    except ValueError as error:
        cleanup_files([str(destination)])
        raise ValueError(str(error)) from error
    except OSError as error:
        cleanup_files([str(destination)])
        raise ValueError("human_image must be a valid image file.") from error
    return str(destination)


def download_url_to_temp(url: str, temp_dir: str) -> str:
    """Download an image URL to a UUID-named temporary file."""
    if not url.startswith(("https://", "http://")):
        raise ValueError("garment_image_url must be an HTTP(S) image URL.")

    try:
        response = requests.get(url, stream=True, timeout=10)
        response.raise_for_status()
    except requests.RequestException as error:
        raise ValueError("Unable to download garment image URL.") from error

    content_type = response.headers.get("Content-Type", "").split(";", 1)[0].lower()
    if not content_type.startswith("image/"):
        response.close()
        raise ValueError("garment_image_url did not return an image content type.")

    destination = Path(temp_dir) / f"{uuid.uuid4()}.jpg"
    try:
        _save_as_rgb_jpeg(
            response.raw,
            destination,
            label="garment_image_url",
            min_width=MIN_GARMENT_IMAGE_WIDTH,
            min_height=MIN_GARMENT_IMAGE_HEIGHT,
        )
    except ValueError as error:
        cleanup_files([str(destination)])
        raise ValueError(str(error)) from error
    except OSError as error:
        cleanup_files([str(destination)])
        raise ValueError("garment_image_url did not return a valid image file.") from error
    finally:
        response.close()
    return str(destination)


def _save_as_rgb_jpeg(
    source: object,
    destination: Path,
    *,
    label: str,
    min_width: int,
    min_height: int,
) -> None:
    """Convert an image stream to RGB JPEG, compositing transparency onto white."""
    image = _decode_and_validate_image(
        source,
        label=label,
        min_width=min_width,
        min_height=min_height,
    )

    if image.mode in {"RGBA", "LA"} or (
        image.mode == "P" and "transparency" in image.info
    ):
        rgba_image = image.convert("RGBA")
        rgb_image = Image.new("RGB", rgba_image.size, "white")
        rgb_image.paste(rgba_image, mask=rgba_image.getchannel("A"))
    else:
        rgb_image = image.convert("RGB")
    rgb_image.save(destination, format="JPEG", quality=95)


def cleanup_files(paths: list[str]) -> None:
    """Delete temporary files or directories without propagating cleanup errors."""
    for path in paths:
        try:
            if os.path.isdir(path):
                shutil.rmtree(path)
            elif os.path.exists(path):
                os.remove(path)
        except OSError as error:
            logger.error("Failed to clean up temporary path %s: %s", path, error)
