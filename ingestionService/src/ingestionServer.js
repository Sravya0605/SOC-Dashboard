require("dotenv").config();
const express = require("express");
const { MongoClient } = require("mongodb");
const Redis = require("ioredis");
const Joi = require("joi");
const pino = require("pino");
const { v4: uuidv4 } = require("uuid");
const rateLimit = require("express-rate-limit");

const logger = pino({ level: process.env.LOG_LEVEL || "info" });
const app = express();

// ---------- CONFIG ----------
const SOC_API_KEY = process.env.SOC_API_KEY;
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017";
const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const PORT = Number(process.env.PORT) || 3000;

const BATCH_SIZE = Number(process.env.BATCH_SIZE) || 500;
const MAX_BUFFER_SIZE = Number(process.env.MAX_BUFFER_SIZE) || 50000;
const FLUSH_INTERVAL_MS = Number(process.env.FLUSH_INTERVAL_MS) || 3000;

if (!SOC_API_KEY) throw new Error("SOC_API_KEY missing");

// ---------- SCHEMAS ----------
const logTypes = {
  auth: Joi.object({
    user: Joi.string().alphanum().required(),
    status: Joi.string().valid("success", "failure").required(),
    ip: Joi.string().ip().required()
  }),
  network: Joi.object({
    src_ip: Joi.string().ip().required(),
    dest_ip: Joi.string().ip().required(),
    port: Joi.number().port().required(),
    bytes: Joi.number().integer().min(0)
  })
};

const envelopeSchema = Joi.object({
  type: Joi.string().valid(...Object.keys(logTypes)).required(),
  payload: Joi.object().required(),
  timestamp: Joi.date().default(() => new Date())
});

// ---------- STATE ----------
let logsCollection;
let logBuffer = [];
let isFlushing = false;

// ---------- DATABASE ----------
const mongoClient = new MongoClient(MONGO_URI, {
  maxPoolSize: 20,
  connectTimeoutMS: 5000,
  serverSelectionTimeoutMS: 5000
});

const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3
});

// Redis visibility
redis.on("connect", () => logger.info("Redis connected"));
redis.on("error", err => logger.error(err, "Redis error"));
redis.on("reconnecting", () => logger.warn("Redis reconnecting"));

// ---------- BATCH FLUSH ----------
async function flushToMongo() {
  if (isFlushing || logBuffer.length === 0) return;

  isFlushing = true;

  const batch = logBuffer.slice();

  try {
    await logsCollection.insertMany(batch, { ordered: false });

    logBuffer.splice(0, batch.length);

    logger.info({ batch_size: batch.length }, "Batch inserted");

  } catch (err) {

    const criticalErrors = err.writeErrors?.filter(e => e.code !== 11000) || [];

    if (criticalErrors.length > 0 || !err.writeErrors) {
      logger.error(err, "Batch insert failure");
    }

  } finally {
    isFlushing = false;
  }
}

const flushTimer = setInterval(flushToMongo, FLUSH_INTERVAL_MS);

// ---------- MIDDLEWARE ----------
app.use(express.json({ limit: "100kb" }));

app.use(rateLimit({
  windowMs: 60000,
  max: 2000
}));

// request tracing
app.use((req, res, next) => {
  req.requestId = req.headers["x-request-id"] || uuidv4();
  next();
});

const authenticate = (req, res, next) => {
  if (req.headers["x-api-key"] !== SOC_API_KEY) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
};

// ---------- ROUTE ----------
app.post("/log", authenticate, (req, res) => {

  if (logBuffer.length >= MAX_BUFFER_SIZE) {
    logger.warn("Buffer overflow - rejecting logs");
    return res.status(503).json({ error: "service saturated" });
  }

  const { error: envError, value: envelope } = envelopeSchema.validate(req.body);
  if (envError) return res.status(400).json({ error: "invalid envelope" });

  const { error: payError, value: payload } = logTypes[envelope.type].validate(envelope.payload);
  if (payError) return res.status(400).json({ error: "invalid payload" });

  const logEntry = {
    _id: req.headers["x-idempotency-key"] || uuidv4(),
    type: envelope.type,
    payload,
    timestamp: envelope.timestamp,
    ingested_at: new Date(),
    request_id: req.requestId
  };

  logBuffer.push(logEntry);

  if (redis.status === "ready") {
    redis.xadd(
      "soc_logs",
      "MAXLEN", "~", 100000,
      "*",
      "raw", JSON.stringify(logEntry)
    ).catch(e => logger.error(e, "Redis stream error"));
  }

  if (logBuffer.length >= BATCH_SIZE && !isFlushing) {
    setImmediate(flushToMongo);
  }

  res.status(202).json({
    status: "accepted",
    id: logEntry._id
  });

});

// ---------- HEALTH ----------
app.get("/health", async (req, res) => {

  let mongoAlive = false;

  try {
    await mongoClient.db().admin().ping();
    mongoAlive = true;
  } catch {}

  const healthy = mongoAlive && redis.status === "ready";

  res.status(healthy ? 200 : 503).json({
    status: healthy ? "healthy" : "degraded",
    buffer_usage: `${((logBuffer.length / MAX_BUFFER_SIZE) * 100).toFixed(2)}%`,
    mongo: mongoAlive ? "connected" : "down",
    redis: redis.status
  });

});

// ---------- START ----------
async function start() {

  try {

    await mongoClient.connect();

    const db = mongoClient.db("soc_core");

    logsCollection = db.collection("events");

    await logsCollection.createIndex({ timestamp: -1 });

    app.listen(PORT, () =>
      logger.info(`SOC ingestion running on ${PORT}`)
    );

  } catch (err) {

    logger.fatal(err, "Startup failed");
    process.exit(1);

  }

}

// ---------- SHUTDOWN ----------
async function shutdown() {

  logger.info("Graceful shutdown");

  clearInterval(flushTimer);

  if (logBuffer.length > 0)
    await flushToMongo();

  await Promise.all([
    mongoClient.close(),
    redis.quit()
  ]);

  process.exit(0);

}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

start();