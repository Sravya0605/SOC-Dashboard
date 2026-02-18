import "dotenv/config";
import express from "express";
import http from "http";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { Server } from "socket.io";

import { connectDB, client as mongoClient } from "./db.js";
import {
  hashPassword,
  comparePassword,
  createToken,
  verifyToken,
  authMiddleware,
} from "./auth.js";
import { startChangeStream } from "./changeStream.js";
import { getMetrics } from "./metrics.js";

async function start() {
  const app = express();
  app.use(express.json());

  const allowed = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",")
    : "*";
  app.use(cors({ origin: allowed }));

  // sensible rate limits
  const loginLimiter = rateLimit({ windowMs: 60_000, max: 5 });
  const apiLimiter = rateLimit({ windowMs: 60_000, max: 200 });

  // ===== DATABASE =====
  const db = await connectDB();
  const users = db.collection("users");
  const alerts = db.collection("alerts");

  // ===== REGISTER =====
  app.post("/register", async (req, res) => {
    const { username, password } = req.body || {};

    if (!username || !password)
      return res.status(400).json({ error: "Missing fields" });

    if (username === "admin" && password === "admin")
      return res.status(400).json({ error: "Default credentials disabled" });

    const exists = await users.findOne({ username });
    if (exists) return res.status(409).json({ error: "User exists" });

    const hashed = await hashPassword(password);
    const result = await users.insertOne({
      username,
      password: hashed,
      role: "analyst",
      createdAt: new Date(),
    });

    res.json({ token: createToken({ _id: result.insertedId, role: "analyst" }) });
  });

  // ===== LOGIN =====
  app.post("/login", loginLimiter, async (req, res) => {
    const { username, password } = req.body || {};

    if (!username || !password)
      return res.status(400).json({ error: "Missing credentials" });

    const user = await users.findOne({ username });
    if (!user || !(await comparePassword(password, user.password)))
      return res.status(401).json({ error: "Invalid credentials" });

    res.json({ token: createToken(user) });
  });

  // ===== ALERTS =====
  app.get("/alerts", apiLimiter, authMiddleware, async (req, res) => {
    try {
      let { cursor, from, to, limit = 50 } = req.query;

      limit = Math.min(Math.max(1, Number(limit) || 50), 1000);

      const query = {};

      if (from || to) query.timestamp = {};
      if (from && !isNaN(Date.parse(from))) query.timestamp.$gte = new Date(from);
      if (to && !isNaN(Date.parse(to))) query.timestamp.$lte = new Date(to);
      if (cursor) query._id = { $lt: new globalThis.ObjectId(cursor) };

      const docs = await alerts.find(query).sort({ _id: -1 }).limit(limit).toArray();

      res.json({ alerts: docs, nextCursor: docs.at(-1)?._id || null });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ===== METRICS =====
  app.get("/metrics", apiLimiter, authMiddleware, async (_req, res) => {
    res.json(await getMetrics(alerts));
  });

  // ===== 404 =====
  app.use((_, res) => res.status(404).json({ error: "Not found" }));

  // ===== SERVER + SOCKET =====
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: allowed } });

  io.use((socket, next) => {
    try {
      verifyToken(socket.handshake.auth?.token);
      next();
    } catch (e) {
      next(new Error("Unauthorized"));
    }
  });

  startChangeStream(alerts, io);

  const PORT = process.env.PORT || 4000;
  server.listen(PORT, () => console.log(`SOC backend on :${PORT}`));

  // graceful shutdown
  const shutdown = async () => {
    try {
      await mongoClient.close();
    } catch (e) {
      /* ignore */
    }
    server.close(() => process.exit(0));
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});