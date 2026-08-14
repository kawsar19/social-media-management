import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { connectDB } from "@/lib/db";
import User from "@/lib/models/User";

export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json().catch(() => null);
    if (!body?.email || !body?.password) {
      return NextResponse.json({ error: "missing_fields" }, { status: 400 });
    }

    const email = body.email.trim().toLowerCase();
    const password = body.password;

    const user = await User.findOne({ email });
    if (!user) {
      return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
    }

    // Accounts created through Google Sign-In have no password to compare
    // against. Point them at the button instead of failing opaquely.
    if (!user.password) {
      return NextResponse.json({ error: "use_google_signin" }, { status: 409 });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
    }

    const token = jwt.sign(
      { userId: user._id.toString() },
      process.env.JWT_SECRET!,
      { expiresIn: process.env.JWT_EXPIRY || "7d" } as jwt.SignOptions
    );

    return NextResponse.json({
      token,
      user: { id: user._id, email: user.email, name: user.name },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "server_error" },
      { status: 500 }
    );
  }
}