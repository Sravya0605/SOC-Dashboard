# SOC (Security Operations Center) Dashboard
A full-stack anomaly detection and security alert platform. Real-time monitoring with React frontend, Node.js backend, and R-based detector.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                       Frontend (React)                          │
│                    Port 5000 (dev)                              │
│              - Login/Register                                   │
│              - Metrics dashboard                                │
│              - Real-time alerts via Socket.io                   │
└────────────────────┬────────────────────────────────────────────┘
                     │ HTTP + WebSocket
                     │
┌────────────────────▼────────────────────────────────────────────┐
│                   Backend (Node.js/Express)                     │
│                      Port 6000                                  │
│              - Authentication (JWT)                             │
│              - Alert CRUD + pagination                          │
│              - Metrics aggregation                              │
│              - Socket.io server for real-time updates           │
└─┬──────────────────────────────────────┬────────────────────────┘
  │                                      │
  │                                      │
┌─▼─────────────────────┐    ┌──────────▼──────────────────────┐
│    MongoDB (soc)      │    │   Redis (Streams + Cache)       │
│  - users              │    │  - soc_logs stream              │
│  - alerts             │    │  - detector:last_id checkpoint  │
│  - metrics cache      │    │  - dedup bloom filter           │
└───────────────────────┘    └──────────┬───────────────────────┘
                                        │
                            ┌───────────▼──────────────┐
                            │    Ingestion Service     │
                            │     Port 3000 (Node)     │
                            │  - Log validation (Joi)  │
                            │  - Redis stream writes   │
                            │  - Rate limiting         │
                            │  - Health check          │
                            └───────────┬──────────────┘
                                        │ Reads logs
                            ┌───────────▼──────────────┐
                            │    Detector (R)          │
                            │  - Isolation forest ML   │
                            │  - Anomaly scoring       │
                            │  - Alert deduplication   │
                            │  - Model retraining      │
                            │  - Writes to MongoDB     │
                            └──────────────────────────┘
```

### Prerequisites

- **Node.js** >= 18 (backend, frontend, ingestion)
- **MongoDB** 4.4+ (local or remote)
- **Redis** 6.0+ (for streams and caching)
- **R** >= 4.0 with build tools (Rtools on Windows, build-essential on Linux)

### 1. Clone & Setup Environment

```bash
cd c:\projects\soc
cp .env.example .env
```

Edit `.env` with your settings:
```bash
SOC_MONGO_URI=mongodb://localhost:27017
JWT_SECRET=your-secure-secret
SOC_API_KEY=your-api-key
SOC_DEDUP_SALT=your-salt
REACT_APP_API_URL=http://localhost:6000
ALLOWED_ORIGINS=http://localhost:3000
```

### 2. Backend Setup

```bash
cd backend
npm install

# Then in PowerShell:
$env:MONGO_URI="mongodb://localhost:27017"
$env:JWT_SECRET="your-secret"
npm start
# Runs on http://localhost:6000
```

### 3. Ingestion Service Setup

```bash
cd ingestionService
npm install

# In PowerShell:
$env:SOC_API_KEY="your-api-key"
node src/ingestionServer.js
# Runs on http://localhost:3000
```

### 4. Detector Setup (R)

**Important:** First ensure you have R packages installed:

```r
# In R console:
install.packages(c("mongolite", "dplyr", "lubridate", "digest", "jsonlite"))
# RcppRedis for Redis:
install.packages("RcppRedis")
```

Then run:
```bash
cd detector

# In PowerShell:
$env:SOC_MONGO_URI="mongodb://localhost:27017"
$env:SOC_REDIS_HOST="127.0.0.1"
$env:SOC_REDIS_PORT="6379"
Rscript detector.R

(The detector now supports faster retraining via env vars. e.g. 
`WINDOW_MINS=5 RETRAIN_MINS=1 TRAIN_MIN_ROWS=50 Rscript detector.R` will
rebuild the model every minute using the last five minutes of data.)

**Note:** The detector will auto-load `.env` from its directory when sourced in RStudio or R.

### 5. Frontend Setup

```bash
cd frontend
npm install

# In PowerShell:
$env:REACT_APP_API_URL="http://localhost:6000"
npm start
# Runs on http://localhost:3000
```

### 6. Test the System

1. **Register a user** at `http://localhost:3000` (username/password)
2. **Verify backend** is running: `curl http://localhost:6000/metrics` (should return 401 if not auth'd)
3. **Send a test log** to ingestion:
   ```bash
   $headers = @{"x-api-key" = "your-api-key"}
   $body = @{
       timestamp = Get-Date -AsUTC
       user = "test_user"
       ip = "192.168.1.1"
       failed_logins = 3
   } | ConvertTo-Json
   Invoke-RestMethod -Uri "http://localhost:3000/log" -Method Post -Body $body -Headers $headers -ContentType "application/json"
   ```
4. **Check logs in Redis**:
   ```bash
   # Using Redis CLI:
   redis-cli XREAD STREAMS soc_logs 0-0 COUNT 10
   ```
5. **Alerts appear** in dashboard as detector processes them

* The dashboard now maintains a short history of `alerts/min` and
  displays a line chart so you can see trends over time. The metrics cards
  include a tiny sparkline as well.

## Module Overview

### Backend (`/backend`)
- **Framework:** Express (Node.js ES modules)
- **Auth:** JWT + bcrypt
- **Database:** MongoDB
- **WebSocket:** Socket.io for real-time alerts
- **Features:**
  - User registration & login
  - Paginated alert retrieval with time-range filtering
  - Aggregated metrics (total, by severity, per-minute rate)
  - Resilient change streams to push new alerts
- **Env Vars:** `MONGO_URI`, `JWT_SECRET`, `JWT_EXPIRES`, `ALLOWED_ORIGINS`, `PORT`

### Frontend (`/frontend`)
- **Framework:** React 19 with Create React App
- **UI Library:** Recharts for metrics visualization
- **HTTP:** Axios with token interceptor
- **WebSocket:** Socket.io-client
- **Features:**
  - Login/logout with persistent token
  - Metrics dashboard (cards + severity chart)
  - Sortable alerts table
  - Error boundary & loading states

### Ingestion Service (`/ingestionService`)
- **Framework:** Express (CommonJS)
- **Validation:** Joi schema for logs
- **Queue:** Redis Streams
- **Features:**
  - API key authentication
  - Rate limiting (100 req/min)
- Configurable metrics cache (see METRICS_CACHE_MS environment variable)
  - Automatic retry logic with exponential backoff
  - Health endpoint
  - Metrics endpoint

### Detector (`/detector`)
- **Language:** R
- **ML Model:** Isolation Forest (isotree)
- **State:** Redis checkpoint + dedup store
- **Features:**
  - Real-time anomaly detection from Redis streams
  - Periodic model retraining (10 min default)
  - Alert deduplication with TTL
  - Graceful error handling with exponential backoff
  - JSON logging for observability


## Development Notes

- **Backend** uses native ES modules (`"type": "module"` in package.json)
- **Ingestion** uses CommonJS (can be migrated if needed)
- **Frontend** uses Create React App; eject if custom webpack is needed
- **Detector** requires exact R package versions; consider using `renv` for reproducibility

## License
ISC
