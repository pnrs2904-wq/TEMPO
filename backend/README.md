# Tempo Focus Reflection Backend Service

This directory contains the production-ready server-side proxy for **Tempo — Energy Focus Timer**.

## 1. Production Architecture Overview

```
Tempo Android App
     │
     │ HTTPS (TLS encryption in transit)
     │ Headers: X-Installation-Id, X-App-Package, X-Request-Timestamp
     │ Body: Max 5 sanitized study sessions (< 16 KB)
     ▼
Tempo Backend Service (Cloud Run / App Engine / VPS)
     │
     │ - Server-Side Gemini API Key (Stored in Secret Manager / env)
     │ - Sliding Window Rate Limiting (Single instance in-memory, or Redis)
     │ - Strict Schema & Payload Size Validation
     │ - Regex Secret & PII Redaction
     │ - Zero Logging of User Session Notes
     │ - 10s Request Timeout with Safe Error Responses
     ▼
Google Gemini API (gemini-2.5-flash)
```

---

## 2. Security & Abuse Protection (P0-1 & P0-2)

- **Server-Side API Key Storage**: The Gemini API key is configured **exclusively** on the backend via the `GEMINI_API_KEY` environment variable or Google Cloud Secret Manager. The Android client contains **zero** API keys or secrets.
- **No Mandatory User Accounts**: Users do not need an account. The backend validates requests using an anonymous installation identifier (`X-Installation-Id`) generated on the device and client IP addresses for abuse prevention and rate limiting.
- **Rate Limiting**: Requests are restricted to a maximum of 10 requests per 10 minutes per installation identifier and 30 requests per 10 minutes per IP. **Note**: If running multiple instances without a distributed cache, configure sticky sessions or Redis; otherwise run as a single container instance (`--max-instances 1` or `--concurrency 80`).
- **Payload & Schema Bounds**:
  - Maximum payload size: 16 KB (enforced by Express body parser).
  - Maximum sessions per request: 5.
  - Maximum subject length: 50 characters.
  - Maximum note length: 250 characters.
  - Planned minutes bounded strictly between 1 and 180.
  - Energy rating bounded strictly between 1 and 5.
- **Log Scrubbing**: The server never logs user session notes or subjects. Only operational telemetry (request ID, response code, duration, session count) is emitted.

---

## 3. Deployment Instructions

### Option A: Google Cloud Run (Recommended)

1. Build and deploy using Google Cloud SDK:
   ```bash
   gcloud run deploy tempo-reflection-service \
     --source . \
     --region us-central1 \
     --platform managed \
     --allow-unauthenticated \
     --set-env-vars GEMINI_API_KEY="YOUR_GEMINI_API_KEY" \
     --memory 512Mi \
     --cpu 1 \
     --concurrency 80 \
     --min-instances 0 \
     --max-instances 5
   ```

2. Retrieve the deployed HTTPS URL (e.g., `https://tempo-reflection-service-xyz-uc.a.run.app`).

3. Configure your Android build to use your deployed endpoint:
   ```bash
   export TEMPO_BACKEND_URL="https://tempo-reflection-service-xyz-uc.a.run.app/api/v1/reflections"
   ./gradlew :app:bundleRelease
   ```

### Option B: Docker Container

```bash
docker build -t tempo-backend .
docker run -d -p 8080:8080 -e GEMINI_API_KEY="YOUR_GEMINI_API_KEY" tempo-backend
```

---

## 4. API Specification

### `POST /api/v1/reflections`

**Headers**:
- `Content-Type: application/json`
- `X-App-Package: com.tempo.focus`
- `X-App-Version: 1.0.0`
- `X-Installation-Id: <UUID>`
- `X-Request-Timestamp: <EpochMs>`

**Request Body**:
```json
{
  "sessions": [
    {
      "subject": "Mathematics",
      "sessionType": "Deep Work",
      "energy": 4,
      "plannedMinutes": 35,
      "note": "Completed calculus chapter 4 problem set."
    }
  ],
  "clientTimestamp": 1758522000000
}
```

**Response (200 OK)**:
```json
{
  "insight": "Strong focus momentum logged with high energy across recent Mathematics sessions. Sustaining 35-minute blocks matches your peak flow."
}
```

**Error Response (429 Too Many Requests)**:
```json
{
  "error": "Too many requests. Please wait a few minutes before requesting another reflection.",
  "code": "RATE_LIMITED"
}
```
