"""
Lightweight RAG (Retrieval-Augmented Generation) over the retailer's own
product descriptions. Uses TF-IDF + cosine similarity - no external model
download, no vector database, no network call - runs entirely in-memory
and instantly, which matters given the timeline and given every external
network dependency in this project has failed at least once tonight.

This is intentionally scoped to free-text product descriptions (the one
piece of catalog data that's genuinely unstructured) - NOT to size charts
or categories, which are structured data better served by exact lookups
(see agent.py's compute_recommended_size and matched_category logic).
"""
from typing import Optional, TypedDict

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity


class CatalogProduct(TypedDict, total=False):
    id: str
    name: str
    category: str
    description: str


def retrieve_relevant_products(
    query: str,
    catalog_products: Optional[list[CatalogProduct]],
    top_k: int = 3,
) -> list[CatalogProduct]:
    """
    Returns the top_k catalog products whose description is most similar
    to the query, via TF-IDF cosine similarity. Returns [] if there's no
    catalog to search or nothing meaningfully similar.
    """
    if not catalog_products:
        return []

    descriptions = [
        f"{p.get('name', '')} {p.get('category', '')} {p.get('description', '')}"
        for p in catalog_products
    ]

    try:
        vectorizer = TfidfVectorizer(stop_words="english")
        matrix = vectorizer.fit_transform(descriptions + [query])
    except ValueError:
        # Empty vocabulary (e.g. every description was blank) - nothing to retrieve.
        return []

    query_vector = matrix[-1]
    product_vectors = matrix[:-1]
    similarities = cosine_similarity(query_vector, product_vectors)[0]

    ranked = sorted(
        zip(catalog_products, similarities), key=lambda pair: pair[1], reverse=True
    )
    # Drop near-zero matches - an unrelated query shouldn't force-return
    # irrelevant products just to fill top_k.
    return [product for product, score in ranked[:top_k] if score > 0.05]


def format_retrieved_context(products: list[CatalogProduct]) -> str:
    """Formats retrieved products into a compact block for the LLM prompt."""
    if not products:
        return ""
    lines = [
        f"- {p.get('name', 'Unknown')} ({p.get('category', 'uncategorized')}): "
        f"{p.get('description', '')[:200]}"
        for p in products
    ]
    return "Relevant items from our actual catalog (use ONLY these when making style suggestions):\n" + "\n".join(lines)