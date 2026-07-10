# Manikan Microservices API Contracts

This document outlines the API contracts (endpoints, request payloads, and response structures) for the Manikan services in the monorepo.

---

## 0. Store Orchestration Proxy (Next.js)
* **Base URL**: `http://localhost:3000`
* **Purpose**: The single entry point for the embeddable widget. The widget calls **only** these routes; the Store proxies to the Python Body Service, persists the `MeasurementSession`, and never exposes internal service URLs. CORS is open (`*`) so the widget can run embedded on any retailer origin.

### **POST** `/api/tryon`
Generates a 3D garment try-on. The Store reads the garment colour/measurements for `product_id` + `size` from the database (source of truth), proxies to the Body Service, persists a `MeasurementSession`, and streams back the `.glb`.

#### **Request Body**
```json
{
  "product_id": "tshirt-001",
  "size": "M",
  "sex": "male",
  "height_cm": 178,
  "weight_kg": 74,
  "chest_cm": 96,
  "waist_cm": 82,
  "hips_cm": 98,
  "recommended_size": "M"
}
```

#### **Response (200 OK)**
Binary `.glb` (`Content-Type: model/gltf-binary`). The `X-Manikan-Session-Id` response header carries the persisted `MeasurementSession` id (`none` if persistence was skipped). Errors: `400` (missing fields), `404` (unknown product), `422` (product not try-on enabled), `502` (body service unreachable).

### **POST** `/api/avatar`
Generates a bare 3D body avatar — no garment, no product context, no session.

#### **Request Body**
```json
{ "sex": "male", "height_cm": 178, "weight_kg": 74, "chest_cm": 96, "waist_cm": 82, "hips_cm": 98 }
```

#### **Response (200 OK)**
Binary `.glb` (`Content-Type: model/gltf-binary`).

---

## 1. 3D Body Service
* **Base URL**: `http://localhost:8001`
* **Purpose**: Performs estimations of SMPL shape parameters, volume calculations, and mesh parameters based on input physical metrics.

### **POST** `/generate-avatar`
Runs the differentiable SMPL optimiser and returns a bare A-pose avatar mesh.

#### **Request Body**
```json
{ "sex": "male", "height_cm": 178, "weight_kg": 74, "chest_cm": 96, "waist_cm": 82, "hips_cm": 98 }
```

#### **Response (200 OK)**
Binary `.glb` (`Content-Type: model/gltf-binary`).

### **POST** `/generate-dressed-avatar`
Same optimiser plus a vertex-coloured garment. Adds `tshirt_color_hex`, `garment_chest_cm`, `garment_length_cm`, `garment_sleeve_cm`, `garment_shoulder_cm` to the request body. Returns a binary `.glb`.

> The widget does not call these directly — the Store proxy (`/api/tryon`, `/api/avatar`) does.

---

## 2. Recommendation Service
* **Base URL**: `http://localhost:8002`
* **Purpose**: LangGraph-powered conversational/personalization agent returning fashion and sizing suggestions.

### **POST** `/recommend/items`
Retrieves a matched outfit recommendation given the user's styling queries, body mesh metrics, and catalog preferences.

#### **Request Header**
```http
Content-Type: application/json
```

#### **Request Body**
```json
{
  "user_id": "usr_99824",
  "body_shape_parameters": [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9],
  "preferences": ["formal", "dark colors", "slim-fit"]
}
```

#### **Response Body (200 OK)**
```json
{
  "status": "success",
  "user_id": "usr_99824",
  "recommendations": [
    {
      "item_id": "outfit_01",
      "name": "Classic Fit Suit",
      "match_confidence": 0.95
    },
    {
      "item_id": "outfit_02",
      "name": "Minimalist Casual",
      "match_confidence": 0.88
    }
  ]
}
```

---

## 3. Virtual Try-On (VTON) Service
* **Base URL**: `http://localhost:8003`
* **Purpose**: Integrates diffusion-based VTON algorithms utilizing Replicate APIs to overlay target garments onto user person images.

### **POST** `/tryon/generate`
Generates a virtual try-on image queue ticket using a target human model image and target apparel image.

#### **Request Header**
```http
Content-Type: application/json
```

#### **Request Body**
```json
{
  "person_image_url": "https://img.manikan.ai/profiles/usr_99824_front.jpg",
  "garment_image_url": "https://img.manikan.ai/catalog/outfit_01_jacket.jpg"
}
```

#### **Response Body (202 Accepted)**
```json
{
  "status": "queued",
  "prediction_id": "mock_replicate_pred_12345",
  "info": "To trigger actual model, configure REPLICATE_API_TOKEN environment variable."
}
```
