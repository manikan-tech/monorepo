"""
Pure-function retrieval tests extracted from live scenario validation.

These tests use no LLM, no network, and no database.
Full integration scenario tests require a live LLM and are run manually.
"""
from app.retrieval import retrieve_relevant_products


def test_tfidf_retrieval_semantic_match():
    catalog = [
        {"id": "p1", "name": "Formal Dress", "category": "Dresses",
         "description": "Elegant evening wear for formal occasions and weddings."},
        {"id": "p2", "name": "Casual T-Shirt", "category": "Shirts",
         "description": "Everyday casual cotton t-shirt."}
    ]
    results = retrieve_relevant_products("weddings", catalog, top_k=1)
    assert len(results) == 1
    assert results[0]["id"] == "p1"


def test_tfidf_no_match_below_threshold():
    catalog = [
        {"id": "p1", "name": "Formal Dress", "category": "Dresses",
         "description": "Elegant evening wear for formal occasions."},
    ]
    results = retrieve_relevant_products("motorcycle engine parts", catalog, top_k=3)
    assert len(results) == 0


def test_tfidf_exclude_shown_ids():
    catalog = [
        {"id": "p1", "name": "Silk Blouse", "category": "Blouses",
         "description": "Beautiful silk blouse for evening wear."},
        {"id": "p2", "name": "Silk Dress", "category": "Dresses",
         "description": "Silk evening dress for formal events."},
    ]
    results = retrieve_relevant_products("silk evening", catalog, top_k=2, exclude_ids=["p1"])
    ids = [r["id"] for r in results]
    assert "p1" not in ids
