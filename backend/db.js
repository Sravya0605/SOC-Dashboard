import { MongoClient } from "mongodb";

if (!process.env.MONGO_URI) throw new Error("MONGO_URI not set");

export const client = new MongoClient(process.env.MONGO_URI, {
  maxPoolSize: 20
});

export async function connectDB() {
  await client.connect();
  console.log("MongoDB connected");
  return client.db("soc");
}