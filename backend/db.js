import { MongoClient } from "mongodb";

if (!process.env.MONGO_URI) throw new Error("MONGO_URI not set");

export const client = new MongoClient(process.env.MONGO_URI, {
  maxPoolSize: 20,
  minPoolSize: 5,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  retryWrites: true,
  monitorCommands: true,
});

// Monitor connection events
client.on('error', (err) => {
  console.error("MongoDB client error:", err.message);
});

client.on('serverOpening', () => {
  console.log("MongoDB server connection opening...");
});

client.on('serverClosed', () => {
  console.warn("MongoDB server connection closed");
});

client.on('topologyOpening', () => {
  console.log("MongoDB topology opening...");
});

client.on('topologyClosed', () => {
  console.warn("MongoDB topology closed");
});

export async function connectDB() {
  const maxRetries = 5;
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await client.connect();
      
      // Verify connection by running a simple command
      const adminDb = client.db("admin");
      await adminDb.command({ ping: 1 });
      
      console.log("MongoDB connected successfully");
      
      // Set up reconnection monitoring
      const db = client.db("soc");
      setInterval(async () => {
        try {
          await adminDb.command({ ping: 1 });
        } catch (err) {
          console.error("MongoDB health check failed:", err.message);
        }
      }, 30000); // Check every 30 seconds
      
      return db;
    } catch (err) {
      lastError = err;
      console.error(`MongoDB connection attempt ${attempt}/${maxRetries} failed:`, err.message);
      
      if (attempt < maxRetries) {
        const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        console.log(`Retrying in ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }
  
  throw new Error(`Failed to connect to MongoDB after ${maxRetries} attempts: ${lastError.message}`);
}