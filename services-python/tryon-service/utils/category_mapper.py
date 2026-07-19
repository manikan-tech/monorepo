# Mapping between Manikan garment categories and OOTDiffusion clothing types.
CATEGORY_MAP = {
    "blouse": "upperbody",
    "shirt": "upperbody",
    "top": "upperbody",
    "tops": "upperbody",
    "tee": "upperbody",
    "tees": "upperbody",
    "tshirt": "upperbody",
    "t_shirt": "upperbody",
    "t-shirt": "upperbody",
    "jacket": "upperbody",
    "upper": "upperbody",
    "upper_body": "upperbody",
    "upperbody": "upperbody",
    "pants": "lowerbody",
    "trouser": "lowerbody",
    "trousers": "lowerbody",
    "jean": "lowerbody",
    "jeans": "lowerbody",
    "short": "lowerbody",
    "shorts": "lowerbody",
    "skirt": "lowerbody",
    "lower": "lowerbody",
    "lower_body": "lowerbody",
    "lowerbody": "lowerbody",
    "dress": "dress",
    "dresses": "dress",
    "overall": "dress",
}


def map_category(category: str) -> str:
    """Map a Manikan category string to an OOTDiffusion clothing type."""
    if not isinstance(category, str) or not category.strip():
        raise ValueError("category is required.")

    normalized_category = category.strip().lower().replace(" ", "_")
    try:
        return CATEGORY_MAP[normalized_category]
    except KeyError as error:
        valid_categories = ", ".join(CATEGORY_MAP)
        raise ValueError(
            f"Invalid category '{category}'. Supported categories: {valid_categories}."
        ) from error
