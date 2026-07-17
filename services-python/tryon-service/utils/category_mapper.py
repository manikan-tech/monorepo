# Mapping between Manikan garment categories and OOTDiffusion clothing types.
CATEGORY_MAP = {
    "blouse": "upperbody",
    "shirt": "upperbody",
    "jacket": "upperbody",
    "upper": "upperbody",
    "upper_body": "upperbody",
    "upperbody": "upperbody",
    "pants": "lowerbody",
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
    normalized_category = category.strip().lower()
    try:
        return CATEGORY_MAP[normalized_category]
    except KeyError as error:
        valid_categories = ", ".join(CATEGORY_MAP)
        raise ValueError(
            f"Invalid category '{category}'. Supported categories: {valid_categories}."
        ) from error
