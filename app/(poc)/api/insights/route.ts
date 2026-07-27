import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Insight from "@/lib/models/Insight";
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

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const user = getUser(request);
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("accountId") || undefined;
    const platform = searchParams.get("platform") || undefined;
    const metric = searchParams.get("metric") || undefined;
    const period = searchParams.get("period") || undefined;
    const startDate = searchParams.get("startDate") || undefined;
    const endDate = searchParams.get("endDate") || undefined;

    const filter: Record<string, unknown> = { userId: user.userId };
    if (accountId) filter.accountId = accountId;
    if (platform) filter.platform = platform;
    if (metric) filter.metric = metric;
    if (period) filter.period = period;
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) (filter.date as Record<string, unknown>).$gte = new Date(startDate);
      if (endDate) (filter.date as Record<string, unknown>).$lte = new Date(endDate);
    }

    const insights = await Insight.find(filter).sort({ date: -1 });
    return NextResponse.json({ insights });
  } catch (error) {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}