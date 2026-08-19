import pytest
import asyncio
from app.agent import call_conversational_agent, FitState
from app.schemas import ActionType, MeasurementInput
from app.retrieval import retrieve_relevant_products

def test_general_discovery_wedding():
    catalog = [
        {"id": "p1", "name": "Formal Dress", "category": "Dresses", "description": "Elegant evening wear for formal occasions and weddings."},
        {"id": "p2", "name": "Casual T-Shirt", "category": "Shirts", "description": "Everyday casual cotton t-shirt."}
    ]
    state: FitState = {
        "messages": [{"role": "user", "content": "I need an outfit for a wedding."}],
        "product_id": None,
        "betas": None,
        "size_chart": None,
        "intent": "search",
        "selected_category": None,
        "available_categories": ["Dresses", "Shirts"],
        "catalog_products": catalog,
        "structured_response": None
    }
    
    new_state = asyncio.run(call_conversational_agent(state))
    resp = new_state.get("structured_response")
    
    assert resp is not None
    assert resp.action == ActionType.PROVIDE_RECOMMENDATION
    assert "Dresses" in resp.message or "dress" in resp.message.lower() or "shirt" in resp.message.lower()

def test_specific_category_fetch_products():
    catalog = [
        {"id": "p1", "name": "Silk Blouse", "category": "Blouses", "description": "A beautiful silk blouse."},
    ]
    state: FitState = {
        "messages": [{"role": "user", "content": "A blouse."}],
        "product_id": None,
        "betas": None,
        "size_chart": None,
        "intent": "search",
        "selected_category": None,
        "available_categories": ["Blouses", "Dresses"],
        "catalog_products": catalog,
        "structured_response": None
    }
    
    new_state = asyncio.run(call_conversational_agent(state))
    resp = new_state.get("structured_response")
    
    assert resp is not None
    assert resp.action == ActionType.FETCH_PRODUCTS
    assert resp.matched_category == "Blouses"
    assert "p1" in resp.retrieved_product_ids

def test_deterministic_sizing():
    state: FitState = {
        "messages": [],
        "product_id": "prod_1",
        "betas": MeasurementInput(height_cm=170, weight_kg=65, chest_cm=90, waist_cm=75, hips_cm=98),
        "size_chart": '[{"size":"S", "chest_cm": 85, "waist_cm": 70, "hip_cm": 93}, {"size":"M", "chest_cm": 90, "waist_cm": 75, "hip_cm": 98}]',
        "intent": "general",
        "selected_category": None,
        "available_categories": [],
        "catalog_products": [],
        "structured_response": None
    }
    
    new_state = asyncio.run(call_conversational_agent(state))
    resp = new_state.get("structured_response")
    
    assert resp is not None
    assert resp.recommended_size == "M"
    assert resp.provider == "STATIC-CALC"
    assert resp.action == ActionType.PROVIDE_RECOMMENDATION

def test_tfidf_retrieval():
    catalog = [
        {"id": "p1", "name": "Formal Dress", "category": "Dresses", "description": "Elegant evening wear for formal occasions and weddings."},
        {"id": "p2", "name": "Casual T-Shirt", "category": "Shirts", "description": "Everyday casual cotton t-shirt."}
    ]
    
    results = retrieve_relevant_products("weddings", catalog, top_k=1)
    assert len(results) == 1
    assert results[0]["id"] == "p1"
