# Cached VTON previews

Drop pre-generated 2D try-on preview images in this folder using the product ID as the filename.

Supported filenames:

- `public/vton-cache/<productId>.png`
- `public/vton-cache/<productId>.webp`
- `public/vton-cache/<productId>.jpg`
- `public/vton-cache/<productId>.jpeg`

Example:

- `public/vton-cache/tshirt-001.png`

When a live VTON generation fails, the store will look for a matching cached preview first and show it if available.
