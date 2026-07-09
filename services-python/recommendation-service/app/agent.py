from typing import Any, Optional, TypedDict
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel, Field
from .config import get_settings

class RecommendationOutput(BaseModel):
    recommended_size: str = Field(
        description="Best-fit size label exactly as it appears in the size chart (e.g. 'S', 'M', 'L')."
    )
    confidence_score: float = Field(
        description="Confidence between 0.0 (low) and 1.0 (high).",
        ge=0.0,
        le=1.0,
    )
    explanation: str = Field(
        description="Warm, specific natural-language explanation of why this size fits and how it feels."
    )
    alternative_size: Optional[str] = Field(
        default=None,
        description="A second size the shopper could try if primary fit is borderline. Omit when confidence is high."
    )

class FitState(TypedDict):
    session_id: str
    product_id: str
    retailer_id: str
    betas: list[float]
    size_chart: list[dict]
    result: Optional[RecommendationOutput]

_SYSTEM_PROMPT = """
You are Manikan's AI Fit Advisor — an expert in 3D body shape analysis and precise clothing size recommendation.

## Understanding the shopper's body (SMPL betas)
You receive 10 SMPL shape parameters (betas), which are PCA components of a 3D body scan:
  β₀  — overall body size (smaller / larger frame)
  β₁  — body fullness / weight (positive → heavier / fuller)
  β₂  — muscularity vs. slimness
  β₃  — torso length
  β₄  — shoulder breadth
  β₅  — leg length proportions
  β₆₋₉ — subtler shape variations (posture, limb proportions, etc.)

## Size chart fields
Each size row contains:
  sizeLabel  — the label to recommend (e.g. "XS", "S", "M", "L", "XL")
  chestCm    — garment chest measurement in centimetres
  waistCm    — garment waist measurement in centimetres
  hipCm      — garment hip measurement in centimetres
  lengthCm   — total garment length in centimetres
  inseamCm   — inseam length in centimetres

## Your reasoning process
1. Infer approximate body measurements from the beta profile.
2. Match those measurements to the size chart in priority order: chest → waist → hip → length → inseam.
3. Choose the size where the most critical measurements fit without pulling.
4. Assign confidence: 0.90–1.0 = excellent, 0.70–0.89 = good, <0.70 = borderline.
5. Recommend an alternative size only when confidence < 0.85.

## Tone
Write the explanation in a warm, confident, body-neutral voice. Describe the *fit feel* — never use negative body language.
""".strip()

def _format_size_chart(rows: list[dict]) -> str:
    if not rows:
        return "(no size chart data provided)"
    header = "| sizeLabel | chestCm | waistCm | hipCm | lengthCm | inseamCm |"
    sep = "|-----------|---------|---------|-------|----------|----------|"
    lines = [header, sep]
    for r in rows:
        lines.append(
            f"| {r.get('sizeLabel', '?')} | {r.get('chestCm', '?')} | {r.get('waistCm', '?')} | {r.get('hipCm', '?')} | {r.get('lengthCm', '?')} | {r.get('inseamCm', '?')} |"
        )
    return "\n".join(lines)

def _build_human_message(state: FitState) -> str:
    betas_str = ", ".join(f"{b:.4f}" for b in state["betas"])
    chart_str = _format_size_chart(state["size_chart"])
    return (
        f"**Product ID**: {state['product_id']}\n\n"
        f"**Shopper SMPL betas**:\n[{betas_str}]\n\n"
        f"**Official Size Chart**:\n{chart_str}\n\n"
        f"Please analyse the fit and return your structured recommendation."
    )

def build_recommendation_graph():
    settings = get_settings()
    llm = ChatOpenAI(
        model="gpt-4o",
        api_key=settings.openai_api_key,
        temperature=0,
        max_retries=2,
    )
    structured_llm = llm.with_structured_output(RecommendationOutput)

    async def analyze_fit(state: FitState) -> dict[str, Any]:
        output = await structured_llm.ainvoke(
            [
                SystemMessage(content=_SYSTEM_PROMPT),
                HumanMessage(content=_build_human_message(state)),
            ]
        )
        return {"result": output}

    graph = StateGraph(FitState)
    graph.add_node("analyze_fit", analyze_fit)
    graph.add_edge(START, "analyze_fit")
    graph.add_edge("analyze_fit", END)
    return graph.compile()

recommendation_graph = build_recommendation_graph()