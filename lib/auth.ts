import { NextRequest } from "next/server";
import jwt from "jsonwebtoken";

export interface AuthUser {
  userId: string;
}

export function authMiddleware(request: NextRequest): AuthUser | null {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.slice("Bearer ".length);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
    return { userId: payload.userId };
  } catch {
    return null;
  }
}

export function generateToken(userId: string): string {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET!,
    { expiresIn: process.env.JWT_EXPIRY || "7d" } as jwt.SignOptions
  );
}