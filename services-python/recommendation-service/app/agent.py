import typing_extensions
import csv
import io
import math
from typing import Optional, Literal, List, Dict, Any
from pydantic import BaseModel, Field
from langchain_openai import ChatOpenAI
from langchain_ollama import ChatOllama
from langgraph.graph import StateGraph, END
from .config import get_settings

class ProductRecommendation(BaseModel):
    product_name: str = Field(..., description="Name of the recommended product.")
    category: str = Field(..., description="Category of the product, e.g., 'blouse', 'pants'.")
    available_sizes: List[str] = Field(..., description="List of available sizes for this product.")
    link: str = Field(..., description="Link to the product page.")

class SizeRecommendationResult(BaseModel):
    recommended_size: str = Field(..., description="The finalized recommended size, e.g., 'M', 'L'.")
    confidence_score: float = Field(..., description="Confidence score between 0.0 and 1.0 calculated via distance metrics.")
    explanation: str = Field(..., description="Detailed and stylish explanation for choosing this size based on the body metrics.")
    alternative_size: Optional[str] = Field(None, description="The second closest matching size as an alternative option.")

class FitState(typing_extensions.TypedDict):
    session_id: str
    messages: list[dict]
    product_id: Optional[str]
    retailer_id: Optional[str]
    betas: Optional[list[float]]
    size_chart: Optional[str]
    known_size: Optional[str]
    result: Optional[SizeRecommendationResult]
    recommended_products: Optional[List[ProductRecommendation]]

def parse_size_chart_csv(csv_string: str) -> List[Dict[str, Any]]:
    try:
        f = io.StringIO(csv_string.strip())
        reader = csv.DictReader(f)
        return [row for row in reader]
    except Exception:
        return []

def calculate_measurements_from_betas(betas: List[float]) -> Dict[str, float]:
    chest_base, waist_base, hips_base = 92.0, 76.0, 96.0
    chest_cm = chest_base + (betas[0] * 4.8) + (betas[1] * 1.2)
    waist_cm = waist_base + (betas[1] * 5.2) + (betas[2] * 1.5)
    hips_cm = hips_base + (betas[2] * 4.5) - (betas[3] * 1.1)
    return {
        "chest_cm": round(max(50.0, chest_cm), 2),
        "waist_cm": round(max(40.0, waist_cm), 2),
        "hip_cm": round(max(50.0, hips_cm), 2)
    }

def compute_best_size_match(betas: List[float], size_chart_rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    body = calculate_measurements_from_betas(betas)
    distances = []

    for row in size_chart_rows:
        try:
            chart_chest = float(row.get("chest_cm") or 0.0)
            chart_waist = float(row.get("waist_cm") or 0.0)
            chart_hips = float(row.get("hip_cm") or 0.0)
            if chart_chest == 0.0 and chart_waist == 0.0: continue
                
            dist = math.sqrt(
                ((body["chest_cm"] - chart_chest) ** 2) +
                ((body["waist_cm"] - chart_waist) ** 2) +
                ((body["hip_cm"] - chart_hips) ** 2)
            )
            distances.append((row.get("size_label", "Unknown"), dist))
        except (ValueError, TypeError):
            continue

    if not distances:
        return {"recommended_size": "M", "confidence_score": 0.5, "alternative_size": "L", "body": body}

    distances.sort(key=lambda x: x[1])
    best_size = distances[0][0]
    best_dist = distances[0][1]
    alt_size = distances[1][0] if len(distances) > 1 else None
    confidence = round(max(0.1, min(1.0, 1.0 - (best_dist / 100.0))), 2)

    return {"recommended_size": best_size, "confidence_score": confidence, "alternative_size": alt_size, "body": body}

def retrieve_products_by_size(size: str) -> List[dict]:
    mock_catalog = [
        {"product_name": "Classic Silk Blouse", "category": "blouse", "available_sizes": ["S", "M", "L", "XL"], "link": "/product/p001"},
        {"product_name": "Linen Wide-Leg Pants", "category": "pants", "available_sizes": ["S", "M", "L", "XL"], "link": "/product/p002"},
        {"product_name": "Tailored Slim Pants", "category": "pants", "available_sizes": ["S", "M", "L"], "link": "/product/p006"}
    ]
    return [p for p in mock_catalog if size.upper() in p["available_sizes"]]

def call_conversational_agent(state: FitState) -> FitState:
    settings = get_settings()
    api_key = settings.openai_api_key
    base_url = "https://lhuedputwdjphaunimvn.supabase.co/functions/v1/ai"
    
    llm = None
    provider_tag = ""

    # Priority tier for external cloud models to test with Supabase gateway routing
    cloud_models_tier = [
        "gpt-4o",
        "anthropic.claude-sonnet-4-6",
        "claude-3-5-sonnet-latest",
        "deepseek-chat",
        "deepseek.v3.2",
        "us.meta.llama3-3-70b-instruct-v1:0"
    ]

    if api_key and not api_key.startswith("your-"):
        for model_name in cloud_models_tier:
            try:
                # Initializing without timeout parameters to allow the network pipeline to resolve completely
                candidate_llm = ChatOpenAI(
                    model=model_name,
                    openai_api_key=api_key,
                    openai_api_base=base_url,
                    temperature=0.2,
                    max_retries=2
                )
                
                # Active invocation check to verify if the remote router accepts the current model name
                candidate_llm.invoke([("user", "ping")])
                
                llm = candidate_llm
                provider_tag = f"MANIKAN-{model_name.upper()}"
                break
            except Exception:
                continue

    # Fallback mechanism triggers only when all cloud providers fail to answer
    if llm is None:
        llm = ChatOllama(
            model=settings.ollama_model,
            base_url=settings.ollama_base_url,
            temperature=0.2,
        )
        provider_tag = "MANIKAN-OLLAMA-FALLBACK"

    last_user_message = ""
    for msg in reversed(state["messages"]):
        if msg["role"] == "user":
            last_user_message = msg["content"].strip().lower()
            break

    explicit_sizes = ["small", "medium", "large", "xl", "xxl", " s ", " m ", " l "]
    detected_size = None
    for size_word in explicit_sizes:
        if size_word in f" {last_user_message} ":
            detected_size = size_word.strip().upper()
            break

    if detected_size:
        state["known_size"] = detected_size
        db_items = retrieve_products_by_size(detected_size)
        state["recommended_products"] = [ProductRecommendation(**item) for item in db_items]
        recommendations_md = "\n".join([f"- **[{item['product_name']}]({item['link']})** ({item['category'].capitalize()})" for item in db_items])
        
        state["messages"].append({
            "role": "assistant",
            "content": f"[{provider_tag}]: Since your size is **{detected_size}**, here are the best fits available in our store:\n\n{recommendations_md}"
        })
        state["result"] = None
        return state

    if state.get("betas") and state.get("size_chart"):
        fit_data = compute_best_size_match(state["betas"], parse_size_chart_csv(state["size_chart"]))
        body_stats = fit_data["body"]

        system_prompt = (
            "You are the Manikan AI Size Recommendation Assistant, an expert fashion co-pilot.\n"
            "Write a sophisticated, fashion-advisor style explanation explaining why this specific size is perfect.\n"
            f"Always start your text with [{provider_tag}].\n\n"
            f"SHOPPER BODY STATS:\n- Chest: {body_stats['chest_cm']} cm\n- Waist: {body_stats['waist_cm']} cm\n- Hips: {body_stats['hip_cm']} cm\n\n"
            f"CALCULATED RECOMMENDATION:\n- Recommended Size: {fit_data['recommended_size']}\n- Alternative Size: {fit_data['alternative_size']}\n- Confidence: {fit_data['confidence_score']}\n\n"
            "Keep the tone minimal, elegant, and premium (Zara or COS style)."
        )

        formatted_messages = [("system", system_prompt)] + [(msg["role"], msg["content"]) for msg in state["messages"]]
        response = llm.invoke(formatted_messages)
        
        state["result"] = SizeRecommendationResult(
            recommended_size=fit_data["recommended_size"],
            confidence_score=fit_data["confidence_score"],
            explanation=str(response.content),
            alternative_size=fit_data["alternative_size"]
        )
        
        state["messages"].append({
            "role": "assistant",
            "content": f"[{provider_tag}]: Calculated perfect match is **{fit_data['recommended_size']}**.\n\n{response.content}"
        })
        return state

    system_prompt = (
        f"You are the Manikan AI Size Recommendation Assistant. Always start your response with [{provider_tag}]. "
        "Ask the shopper politely to provide measurements or click 'Connect 3D Avatar'."
    )
    formatted_messages = [("system", system_prompt)] + [(msg["role"], msg["content"]) for msg in state["messages"]]
    response = llm.invoke(formatted_messages)
    
    state["messages"].append({"role": "assistant", "content": str(response.content)})
    state["result"] = None
    return state

def route_next_step(state: FitState) -> Literal["agent_node", "__end__"]: 
    return END

workflow = StateGraph(FitState)
workflow.add_node("agent_node", call_conversational_agent)
workflow.set_entry_point("agent_node")
workflow.add_conditional_edges("agent_node", route_next_step)
recommendation_graph = workflow.compile()