# linkpulse
URL shortener and link analytics platform

## Overview
LinkPulse is an integrated link management, redirection, and real-time analytics platform built with Node.js 24 and Express using JavaScript ES modules and persistent ACID-compliant storage via Node's built-in `node:sqlite`.

---

## Key Features
- **URL Shortening**: Generates collision-resistant 6-character short codes or accepts custom alphanumeric aliases.
- **Strict Security Validation**: Accepts only valid `http://` and `https://` destination URLs; rejects `javascript:`, `data:`, or malformed schemes.
- **Rule-Driven Redirect Engine**:
  - **Active Status Check**: Links can be toggled active or disabled on demand; disabled links halt redirection (`403 Forbidden`).
  - **Expiry Enforcement**: Links configured with expiration dates automatically expire (`410 Gone`).
  - **Atomic Click Cap**: Safe under high concurrency; links stop redirecting immediately upon reaching their click limit without race conditions (`410 Gone`).
- **Real-Time Analytics & Tracking**:
  - Captures visit timestamp, referrer, device type (Desktop, Mobile, Tablet), browser, and bot detection.
  - Aggregates live click counts, human vs. bot visits, top referrers, and recent visit history without hardcoded values.
- **Persistent Storage**: Uses Node.js 24's native `node:sqlite` (`DatabaseSync`) stored in `data/linkpulse.db`. Data survives server restarts without external database setup.
- **Built-in Dashboard**: A modern, responsive web UI served directly at `/`.

---

## Prerequisites
- **Node.js**: v24.0.0 or higher (uses built-in `node:sqlite`)
- **npm**: v11.0.0 or higher (use `npm.cmd` on Windows PowerShell)

---

## Getting Started

### 1. Installation
Install project dependencies inside the repository root (`F:\linkpulse\linkpulse`):

```powershell
npm.cmd install
```

### 2. Environment Configuration (Optional)
The server runs with default settings (`PORT=5000`, `DB_PATH=data/linkpulse.db`) out of the box. To customize, copy `.env.example` to `.env`:

```powershell
Copy-Item .env.example .env
```

---

## Running the Application

### Development Mode (with auto-restart)
```powershell
npm.cmd run dev
```

### Production Mode
```powershell
npm.cmd start
```

Once started, open your browser to **`http://localhost:5000`** to access the live dashboard.

---

## Running Tests

Run the full automated test suite (18 tests covering link creation, redirects, rule enforcement, concurrent click caps, analytics, and restart persistence):

```powershell
npm.cmd test
```

---

## API Reference

### 1. Health Check
* **`GET /api/health`**
* **Response (200 OK):**
  ```json
  {
    "status": "ok",
    "uptime": 12.34,
    "timestamp": "2026-10-20T08:00:00.000Z"
  }
  ```

### 2. Create Short Link
* **`POST /api/links`**
* **Request Body:**
  ```json
  {
    "url": "https://example.com/very/long/destination/url",
    "customAlias": "my-campaign",
    "clickLimit": 100,
    "expiresAt": "2026-12-31T23:59:59.000Z"
  }
  ```
  *(All fields except `url` are optional)*
* **Response (201 Created):**
  ```json
  {
    "id": 1,
    "shortCode": "my-campaign",
    "originalUrl": "https://example.com/very/long/destination/url",
    "customAlias": "my-campaign",
    "isActive": true,
    "expiresAt": "2026-12-31T23:59:59.000Z",
    "clickLimit": 100,
    "clickCount": 0,
    "status": "active",
    "createdAt": "2026-10-20T08:15:00.000Z",
    "updatedAt": "2026-10-20T08:15:00.000Z",
    "shortUrl": "http://localhost:5000/my-campaign"
  }
  ```

### 3. List All Links
* **`GET /api/links`**
* **Response (200 OK):** Returns array of all managed links with current status, click counts, and short URLs.

### 4. Link Analytics
* **`GET /api/links/:shortCode/analytics`**
* **Response (200 OK):**
  ```json
  {
    "link": { ... },
    "summary": {
      "totalClicks": 42,
      "recordedEvents": 42,
      "botClicks": 2,
      "humanClicks": 40
    },
    "breakdowns": {
      "devices": { "desktop": 30, "mobile": 12 },
      "browsers": { "Chrome": 28, "Safari": 10, "Firefox": 4 },
      "referrers": { "news.ycombinator.com": 20, "Direct / None": 22 }
    },
    "recentClicks": [ ... ]
  }
  ```

### 5. Toggle Link Active Status
* **`PATCH /api/links/:shortCode/toggle`**
* **Request Body:**
  ```json
  { "isActive": false }
  ```
* **Response (200 OK):** Updated link object.

### 6. Redirection
* **`GET /:shortCode`**
* **Behavior:**
  * Active & unexpired: `302 Found` with `Location` header.
  * Disabled: `403 Forbidden` (`{ "reason": "disabled" }`).
  * Expired: `410 Gone` (`{ "reason": "expired" }`).
  * Limit reached: `410 Gone` (`{ "reason": "limit_reached" }`).
  * Unknown code: `404 Not Found`.

---

## Deployment Assessment & Cloud Compatibility

* **Single-instance hosting (Render, Railway, Fly.io, DigitalOcean VPS):**
  * When deploying with `node:sqlite`, attach a **persistent disk/volume** mounted at `/data` (e.g. `DB_PATH=/data/linkpulse.db`) so database writes persist across deployments.
* **Stateless / Serverless platforms (Vercel, AWS Lambda):**
  * Serverless environments use ephemeral filesystems. For serverless hosting, swap the `DatabaseSync` engine with a cloud database like MongoDB Atlas or Supabase PostgreSQL.
