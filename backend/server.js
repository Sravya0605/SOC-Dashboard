import "dotenv/config";
import http from "http";
import { Server } from "socket.io";

import { connectDB, client as mongoClient } from "./db.js";
import config from "./config.js";
import { createApp } from "./app.js";

async function start() {
  // connect and build app with injected database
  const db = await connectDB();
  const app = createApp({ db });

  const allowed =
    config.ALLOWED_ORIGINS === "*"
      ? "*"
      : config.ALLOWED_ORIGINS.split(",");

  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: allowed } });
  app.startSocket(server, io);

  const PORT = config.PORT;
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
