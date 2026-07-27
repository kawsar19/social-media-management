import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { connectDB } from "@/lib/db";
import User from "@/lib/models/User";

export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json().catch(() => null);
    if (!body?.email || !body?.name || !body?.password) {
      return NextResponse.json({ error: "missing_fields" }, { status: 400 });
    }

    const email = body.email.trim().toLowerCase();
    const name = body.name.trim();
    const password = body.password;

    if (email.length === 0 || name.length === 0 || password.length < 6) {
      return NextResponse.json({ error: "validation_failed" }, { status: 400 });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return NextResponse.json({ error: "email_exists" }, { status: 409 });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({ email, name, password: hashedPassword });

    const token = jwt.sign(
      { userId: user._id.toString() },
      process.env.JWT_SECRET!,
      { expiresIn: process.env.JWT_EXPIRY || "7d" } as jwt.SignOptions
    );

    return NextResponse.json(
      {
        token,
        user: { id: user._id, email: user.email, name: user.name },
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: "server_error" },
      { status: 500 }
    );
  }
}