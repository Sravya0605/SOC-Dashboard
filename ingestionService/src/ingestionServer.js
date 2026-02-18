require("dotenv").config();

const express = require("express");
const Redis = require("ioredis");
const { MongoClient } = require("mongodb");
const rateLimit = require("express-rate-limit");
const Joi = require("joi");

const app = express();
app.use(express.json());

const {
  SOC_API_KEY,
  SOC_REDIS_HOST = "127.0.0.1",
  SOC_REDIS_PORT = 6379,
  MONGO_URI = "mongodb://localhost:27017"
} = process.env;

if (!SOC_API_KEY) throw new Error("SOC_API_KEY missing");

// ---------- REDIS ----------
const redis = new Redis({ host: SOC_REDIS_HOST, port: SOC_REDIS_PORT });

// ---------- MONGODB ----------
const mongoClient = new MongoClient(MONGO_URI);
let db, logsCollection;

// ---------- METRICS ----------
let totalLogs = 0;
let totalErrors = 0;
let lastWriteTime = null;

// ---------- RATE LIMIT ----------
app.use(rateLimit({ windowMs: 60_000, max: 100 }));

// ---------- AUTH ----------
app.use((req, res, next) => {
  if (req.headers["x-api-key"] !== SOC_API_KEY)
    return res.status(401).json({ error: "unauthorized" });
  next();
});

// ---------- SCHEMA ----------
const logSchema = Joi.object({
  timestamp: Joi.date().required(),
  user: Joi.string().required(),
  ip: Joi.string().ip().required(),
  failed_logins: Joi.number().integer().min(0).required(),
});

// ---------- RETRY ----------
async function retry(fn, retries = 3, delay = 200, maxDelay = 5000) {
  try {
    return await fn();
  } catch (e) {
    if (retries === 0) throw e;
    await new Promise(r => setTimeout(r, Math.min(delay, maxDelay)));
    return retry(fn, retries - 1, delay * 2, maxDelay);
  }
}

// ---------- LOG ENDPOINT ----------
app.post("/log", async (req, res) => {
  totalLogs++;

  const { error, value } = logSchema.validate(req.body);
  if (error) {
    totalErrors++;
    return res.status(400).json({ error: error.message });
  }

  try {
    // Write to MongoDB (persistent storage)
    await logsCollection.insertOne({
      ...value,
      timestamp: new Date(value.timestamp),
      ingested_at: new Date()
    });

    // Also write to Redis stream for real-time processing
    // XADD soc_logs * field1 value1 field2 value2... (individual fields, not JSON)
    if (redis.status === "ready") {
      await retry(() =>
        redis.xadd(
          "soc_logs",
          "MAXLEN", "~", 10000,  // Keep max ~10k entries
          "*",                    // Auto-generate ID
          "timestamp", new Date(value.timestamp).toISOString(),
          "user", value.user,
          "ip", value.ip,
          "failed_logins", value.failed_logins.toString()
        )
      );
    }

    lastWriteTime = new Date();
    res.json({ status: "ingested" });

  } catch (e) {
    totalErrors++;
    res.status(500).json({ error: "failed to ingest log: " + e.message });
  }
});

// ---------- HEALTH ----------
app.get("/health", async (req, res) => {
  res.json({
    status: redis.status === "ready" ? "ok" : "degraded",
    redis: redis.status,
    last_write: lastWriteTime,
  });
});

// ---------- METRICS ----------
app.get("/metrics", (req, res) => {
  res.json({
    logs_received: totalLogs,
    errors: totalErrors,
    uptime_sec: process.uptime(),
  });
});

// ---------- START ----------
async function start() {
  try {
    // Connect to MongoDB
    await mongoClient.connect();
    db = mongoClient.db("soc");
    logsCollection = db.collection("logs");
    console.log("Connected to MongoDB");
  } catch (e) {
    console.error("MongoDB connection failed:", e.message);
    process.exit(1);
  }

  try {
    await redis.ping();
    console.log("Connected to Redis");
  } catch (e) {
    console.warn("Redis unavailable (optional):", e.message);
  }

  app.listen(3000, () => console.log("SOC ingestion running on :3000"));
}

start().catch(e => {
  console.error("Failed to start:", e);
  process.exit(1);
});

// ---------- SHUTDOWN ----------
async function shutdown() {
  console.log("Shutting down...");
  try {
    await mongoClient.close();
  } catch (e) {}
  try {
    await redis.quit();
  } catch (e) {}
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

