import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Post from "@/lib/models/Post";
import jwt from "jsonwebtoken";

function getUser(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length);
  try {
    return jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest, { params }: { params: any }) {
  try {
    await connectDB();

    const { id } = await params;
    const user = getUser(request);
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const post = await Post.findOne({ _id: id, userId: user.userId });
    if (!post) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    return NextResponse.json({ message: "publish endpoint - integrate with platform API" });
  } catch (error) {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
