# Running Excalidraw with Postgres Locally

## Quick Start (without Docker)

### 1. Start Postgres Database
```bash
# Using Docker for Postgres only
docker run -d \
  --name excalidraw-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=postgres \
  -p 5432:5432 \
  supabase/postgres:15.1.0.117
```

### 2. Create Database Tables
```bash
# Connect to Postgres and create tables
docker exec -it excalidraw-postgres psql -U postgres -d postgres

# Run these SQL commands:
CREATE TABLE IF NOT EXISTS scenes (
    id TEXT PRIMARY KEY,
    data JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    data BYTEA NOT NULL,
    mime_type TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

\q
```

### 3. Start Postgres API Server
```bash
cd postgres-api
npm install
npm start
```

The API will be available at http://localhost:4001

### 4. Start Excalidraw App
```bash
# In another terminal, from project root
export VITE_APP_REMOTE_STORAGE=postgres
export VITE_APP_POSTGRES_API_BASE_URL=http://localhost:4001

npm start
```

The app will be available at http://localhost:5173 (or similar Vite dev port)

## Testing

1. Open http://localhost:5173
2. Draw something
3. Click "Save to cloud" (if available in collab mode)
4. Verify data is saved in Postgres:

```bash
docker exec -it excalidraw-postgres psql -U postgres -d postgres -c "SELECT id, created_at FROM scenes;"
```

## Docker Compose (Alternative)

If Docker build is too slow, you can:

1. Pre-build locally:
```bash
npm install
npm run build:app:docker
```

2. Then use Docker Compose:
```bash
docker-compose up
```

## Stopping Services

```bash
# Stop Postgres
docker stop excalidraw-postgres
docker rm excalidraw-postgres

# Stop other processes with Ctrl+C
```
