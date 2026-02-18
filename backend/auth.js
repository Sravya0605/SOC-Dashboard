import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET not set");

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES = process.env.JWT_EXPIRES || "8h";

export const hashPassword = p => bcrypt.hash(p, 12);
export const comparePassword = (p, h) => bcrypt.compare(p, h);

export function createToken(user) {
  return jwt.sign({ id: user._id.toString(), role: user.role }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES
  });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    if (err.name === "TokenExpiredError") throw new Error("TOKEN_EXPIRED");
    throw new Error("TOKEN_INVALID");
  }
}

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer "))
    return res.status(401).json({ error: "Unauthorized" });

  try {
    req.user = verifyToken(header.split(" ")[1]);
    next();
  } catch (err) {
    return res.status(401).json({ error: err.message });
  }
}