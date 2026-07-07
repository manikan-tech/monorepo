# Manikan Microservices API Contracts

This document outlines the API contracts (endpoints, request payloads, and response structures) for the Python microservices in the Manikan Monorepo.

---

## 1. 3D Body Service
* **Base URL**: `http://localhost:8001`
* **Purpose**: Performs estimations of SMPL shape parameters, volume calculations, and mesh parameters based on input physical metrics.

### **POST** `/calculate/smpl`
Generates SMPL shape parameters from standard user physical measurements.

#### **Request Header**
```http
Content-Type: application/json
```

#### **Request Body**
```json
{
  "height": 178.5,
  "weight": 72.0,
  "chest": 96.0,
  "waist": 82.5,
  "hips": 98.0
}
```

#### **Response Body (200 OK)**
```json
{
  "status": "success",
  "smpl_shape_parameters": [
    0.0,
    0.1,
    0.2,
    0.3,
    0.4,
    0.5,
    0.6,
    0.7,
    0.8,
    0.9
  ],
  "estimated_volume_liters": 64.26
}
```

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
