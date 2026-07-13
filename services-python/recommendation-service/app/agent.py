from typing import typing_extensions, Optional, Literal
from pydantic import BaseModel, Field
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langgraph.graph import StateGraph, END
from .config import get_settings

class SizeRecommendationResult(BaseModel):
    recommended_size: str = Field(..., description="The finalized recommended size, e.g., 'M', 'L'.")
    confidence_score: float = Field(..., description="Confidence score between 0.0 and 1.0.")
    explanation: str = Field(..., description="Detailed explanation for choosing this size based on the metrics.")
    alternative_size: Optional[str] = Field(None, description="An alternative size if applicable.")

class FitState(typing_extensions.TypedDict):
    session_id: str
    messages: list[dict]
    product_id: Optional[str]
    retailer_id: Optional[str]
    betas: Optional[list[float]]
    size_chart: Optional[str]
    result: Optional[SizeRecommendationResult]

def call_conversational_agent(state: FitState) -> FitState:
    settings = get_settings()
    
    llm = ChatOpenAI(
        model="gpt-4o",
        temperature=0.0,
        openai_api_key=settings.openai_api_key
    )
    
    system_prompt = (
        "You are the Manikan AI Size Recommendation Assistant, an expert fashion co-pilot.\n"
        "Your task is to interact with the user to determine their best clothing size.\n\n"
        "CRITICAL RULES:\n"
        "1. If the user provides their 10 body shape parameters (betas) AND a product size chart (passed as a CSV string below), "
        "you MUST trigger the size calculation and respond using the structured 'SizeRecommendationResult' format.\n"
        "2. If the 10 betas or the size chart are missing, interact politely in a minimal, premium tone (like Zara or COS style). "
        "Ask the user to provide their body parameters or state what they need, and do NOT fill out the structured size parameters yet.\n"
        "3. When a size chart is provided, use it as your ground-truth context to map the user's body parameters (betas) to the closest matching size.\n\n"
        f"CURRENT CONTEXT SIZE CHART (CSV):\n{state.get('size_chart') or 'No size chart provided yet.'}\n\n"
        f"USER BODY PARAMETERS (BETAS):\n{state.get('betas') or 'No betas provided yet.'}"
    )
    
    formatted_messages = [("system", system_prompt)]
    for msg in state["messages"]:
        formatted_messages.append((msg["role"], msg["content"]))
        
    if state.get("betas") and state.get("size_chart"):
        structured_llm = llm.with_structured_output(SizeRecommendationResult)
        response = structured_llm.invoke(formatted_messages)
        state["result"] = response
    else:
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