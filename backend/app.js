import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { Server } from "socket.io";
import { ObjectId } from "mongodb";

import config from "./config.js";
import {
  hashPassword,
  comparePassword,
  createToken,
  verifyToken,
  authMiddleware,
} from "./auth.js";
import { startChangeStream } from "./changeStream.js";
import { getMetrics } from "./metrics.js";
import {
  registerSchema,
  loginSchema,
  alertsQuerySchema,
} from "./validators.js";

export function createApp({ db }) {
  const app = express();
  app.use(express.json());

  const allowed =
    config.ALLOWED_ORIGINS === "*"
      ? "*"
      : config.ALLOWED_ORIGINS.split(",");
  app.use(cors({ origin: allowed }));

  // Log all requests
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
  });

  const loginLimiter = rateLimit({ windowMs: 60_000, max: 5 });
  const apiLimiter = rateLimit({ windowMs: 60_000, max: 200 });

  const users = db.collection("users");
  const alerts = db.collection("alerts");

  app.post("/register", async (req, res) => {
    const { error, value } = registerSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.message });
    const { username, password, role } = value;

    if (username === "admin" && password === "admin")
      return res.status(400).json({ error: "Default credentials disabled" });

    const exists = await users.findOne({ username });
    if (exists) return res.status(409).json({ error: "User exists" });

    const hashed = await hashPassword(password);
    const result = await users.insertOne({
      username,
      password: hashed,
      role: role || "analyst",
      name: "",
      picture: "",
      createdAt: new Date(),
    });

    res.json({ token: createToken({ _id: result.insertedId, role: role || "analyst" }) });
  });

  app.post("/login", loginLimiter, async (req, res) => {
    const { error, value } = loginSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.message });
    const { username, password } = value;

    const user = await users.findOne({ username });
    if (!user || !(await comparePassword(password, user.password)))
      return res.status(401).json({ error: "Invalid credentials" });

    res.json({ token: createToken(user) });
  });

  app.get("/alerts", apiLimiter, authMiddleware, async (req, res) => {
    const { error, value } = alertsQuerySchema.validate(req.query);
    if (error) return res.status(400).json({ error: error.message });
    let { cursor, from, to, limit } = value;

    const query = {};
    if (from || to) query.timestamp = {};
    if (from) query.timestamp.$gte = new Date(from);
    if (to) query.timestamp.$lte = new Date(to);
    if (cursor) query._id = { $lt: new ObjectId(cursor) };

    try {
      const docs = await alerts
        .find(query)
        .sort({ _id: -1 })
        .limit(limit)
        .toArray();
      res.json({ alerts: docs, nextCursor: docs.at(-1)?._id || null });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.get("/metrics", apiLimiter, authMiddleware, async (_req, res) => {
    res.json(await getMetrics(alerts));
  });

  app.get("/profile", apiLimiter, authMiddleware, async (req, res) => {
    try {
      const user = await users.findOne({ _id: new ObjectId(req.user.id) });
      if (!user) {
        return res.status(404).json({ error: "User not found in database" });
      }
      
      res.json({
        id: user._id,
        username: user.username,
        name: user.name || "",
        picture: user.picture || "",
        role: user.role || "analyst"
      });
    } catch (err) {
      console.error("Profile fetch error:", err);
      res.status(500).json({ error: "Server error: " + err.message });
    }
  });

  // Debug endpoint - shows current user info from token and database
  app.get("/debug/profile", authMiddleware, async (req, res) => {
    try {
      console.log("Debug endpoint - User from token:", req.user);
      
      const user = await users.findOne({ _id: req.user.id });
      res.json({
        tokenId: req.user.id,
        userExists: !!user,
        user: user ? {
          _id: user._id.toString(),
          username: user.username,
          role: user.role,
          name: user.name,
          picture: user.picture ? "set" : "not set"
        } : null
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/profile", apiLimiter, authMiddleware, async (req, res) => {
    const { name, picture, role } = req.body;
    if (typeof name !== "string") {
      return res.status(400).json({ error: "Name is required" });
    }
    if (picture !== undefined && picture !== null && typeof picture !== "string") {
      return res.status(400).json({ error: "Picture must be a string" });
    }
    if (role && typeof role !== "string") {
      return res.status(400).json({ error: "Role must be a string" });
    }
    const update = { name };
    if (picture !== undefined) update.picture = picture;
    if (role) update.role = role;
    try {
      const result = await users.updateOne(
        { _id: new ObjectId(req.user.id) },
        { $set: update }
      );
      
      if (result.matchedCount === 0) {
        return res.status(404).json({ error: "User not found in database" });
      }
      res.json({ success: true });
    } catch (err) {
      console.error("Profile update error:", err);
      res.status(500).json({ error: "Server error: " + err.message });
    }
  });

  app.use((_, res) => res.status(404).json({ error: "Not found" }));

  // attach socket initialization helper
  app.startSocket = (server, io) => {
    io.use((socket, next) => {
      try {
        verifyToken(socket.handshake.auth?.token);
        next();
      } catch (e) {
        next(new Error("Unauthorized"));
      }
    });
    startChangeStream(alerts, io);

    // emit metrics every second for live updates
    setInterval(async () => {
      try {
        const metrics = await getMetrics(alerts);
        io.emit('metrics', metrics);
      } catch (err) {
        console.error('Error emitting metrics:', err);
      }
    }, 1000);
  };

  return app;
}
