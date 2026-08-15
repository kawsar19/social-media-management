import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import AutoPost from "@/lib/models/AutoPost";
import { getUser } from "../../posts/postSchema";
import { autoPostInputSchema } from "../route";

// /api/autopilot/[id] — update, toggle, or delete one automation.
//
// Every query is scoped by userId as well as _id, so a guessed id from another
// account resolves to nothing rather than to someone else's automation.

// PATCH — a full update (the edit form) or a partial one (the enable/disable
// toggle, which sends only { enabled }).
export async function PATCH(request: NextRequest, { params }: { params: any }) {
  try {
    await connectDB();
    const { id } = await params;
    const user = getUser(request);
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    // The toggle sends nothing but `enabled`, and running that through the full
    // schema would demand prompt/targets/timeOfDay it never sends. Handled as
    // its own case so pausing an automation stays a one-field request.
    const keys = Object.keys(body);
    const isToggleOnly = keys.length === 1 && keys[0] === "enabled";

    let update: Record<string, unknown>;
    if (isToggleOnly) {
      if (typeof body.enabled !== "boolean") {
        return NextResponse.json({ error: "Invalid request." }, { status: 400 });
      }
      update = { enabled: body.enabled };
    } else {
      const parsed = autoPostInputSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message || "Invalid automation." },
          { status: 400 }
        );
      }
      if (parsed.data.frequency === "weekly" && parsed.data.daysOfWeek.length === 0) {
        return NextResponse.json(
          { error: "Pick at least one day of the week." },
          { status: 400 }
        );
      }
      update = {
        ...parsed.data,
        targets: parsed.data.targets.map((t) => ({
          ...t,
          accountId: t.accountId ? new mongoose.Types.ObjectId(t.accountId) : undefined,
        })),
      };
      // Editing the time or the days makes the stored occurrence key refer to a
      // schedule that no longer exists. Clearing it lets the new schedule fire
      // today; keeping it could suppress the first run after an edit.
      update.lastRunKey = undefined;
    }

    const autoPost = await AutoPost.findOneAndUpdate(
      { _id: id, userId: user.userId },
      update,
      { new: true }
    );
    if (!autoPost) return NextResponse.json({ error: "not_found" }, { status: 404 });

    return NextResponse.json({ autoPost });
  } catch {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

// DELETE — remove the automation. Posts it already published are left alone;
// they're real posts and deleting them would be a surprise.
export async function DELETE(request: NextRequest, { params }: { params: any }) {
  try {
    await connectDB();
    const { id } = await params;
    const user = getUser(request);
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const deleted = await AutoPost.findOneAndDelete({ _id: id, userId: user.userId });
    if (!deleted) return NextResponse.json({ error: "not_found" }, { status: 404 });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
