# Manikan AI Recommendation Service - Known Limitations & Vulnerability Audit

This document outlines the known architectural limitations, logic flaws, and security vulnerabilities discovered during the systems security audit of the Recommendation Service.

## 1. Security & Authentication Gaps

### Exposed Symmetric Key (Client-Side Direct Connection)
**Severity: Critical**
The current architecture allows the Next.js frontend widget (`recommend-widget.js`) to directly call the FastAPI `/recommend` endpoint, secured only by an `X-Widget-Key` header matching `RECOMMEND_API_KEY`. Because this widget executes in the user's browser, the key is fully exposed in network payloads and source code. Malicious actors can extract this key and interact with the service directly, bypassing intended CORS limits, rate limits, and quota deductions. 
*Mitigation:* Migrate to the Next.js Zero Trust Proxy pattern (used by the Body Service) to secure the API key server-side.

## 2. Denial of Service (DoS) Risks

### Unbounded `catalog_products` Payload Processing
**Severity: High**
The stateless RAG architecture requires the client to send the `catalog_products` array in the request payload. There is currently no hard limit on the size of this array. A malicious actor could send a payload containing hundreds of thousands of mock products. Because `TfidfVectorizer` processes these descriptions synchronously in memory, a massive payload will spike CPU utilization, block the Python async event loop, and cause a DoS for all other requests hitting that worker.
*Mitigation:* Implement strict payload size limits (e.g., maximum 50 products) in the FastAPI Pydantic schema (`ChatRecommendRequest`).

## 3. Race Conditions & State Isolation

### In-Memory Rate Limiting
**Severity: Medium**
The service implements a naive rate limit and usage tracking system using Python's `defaultdict(deque)` stored in memory (`_request_log` and `_usage_log`). While thread-safe due to the GIL, this state is isolated per process. In a production environment running multiple Uvicorn workers or distributed ECS containers, rate limits will not be shared. Attackers can bypass the 10-request limit by rotating their requests across different backend workers.
*Mitigation:* Migrate rate limiting to a centralized Redis cache.

## 4. Hallucination Risks & Logic Flaws

### Category Hallucination / State Mismatch
**Severity: Medium**
The defensive guard in `agent.py` drops `response.matched_category` if the LLM invents a category not found in `available_categories`. However, it leaves `response.message` intact. If the LLM generates the message, "We have some great jackets!", but "jackets" is dropped by the guardrail, the UI will display the message while rendering zero product cards. This creates a confusing contradiction for the user.
*Mitigation:* If `matched_category` is dropped, the system should ideally force a generic fallback message or prompt the LLM to regenerate.

### Reverse Message Parsing Loop
**Severity: Low**
The `_find_stated_size_and_confidence` function scans user messages in reverse to find size labels (e.g., "XL"), but it strictly checks only the *last* message (`user_messages[-1]`) for the confidence percentage. If a user states their size in one message, and then follows up with another unrelated message without a percentage, the confidence score will be evaluated as `None`, forcing the agent into a loop to ask for confidence again despite already knowing the size.
