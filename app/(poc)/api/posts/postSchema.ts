import { NextRequest } from "next/server";
import jwt from "jsonwebtoken";
import { z } from "zod";

// Shared validation + auth for the posts routes. A Post is authored once and
// published to one or more targets; the client sends the content plus the list
// of targets (where it should go). Publish results are written server-side by
// the publish route, not accepted from the client.

export const targetInputSchema = z.object({
  platform: z.enum(["linkedin", "facebook", "instagram", "threads", "youtube"]),
  accountId: z.string().optional(),
  accountName: z.string().optional(),
  destinationId: z.string().optional(),
  destinationName: z.string().optional(),
});

export const postInputSchema = z.object({
  content: z.string().default(""),
  mediaUrl: z.string().url().optional(),
  mediaType: z.enum(["image", "video"]).optional(),
  youtubeTitle: z.string().optional(),
  youtubePrivacy: z.enum(["private", "unlisted", "public"]).optional(),
  status: z.enum(["draft", "scheduled"]).optional(), // create/update only set these
  // `null` clears the schedule (used when a queued post is pulled back to a
  // draft). It has to be spelled out: z.coerce.date() alone turns null into the
  // epoch, which would leave the post looking permanently overdue rather than
  // unscheduled.
  scheduledAt: z.union([z.coerce.date(), z.null()]).optional(),
  targets: z.array(targetInputSchema).default([]),
});

export type PostInput = z.infer<typeof postInputSchema>;

export function getUser(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length);
  try {
    return jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
  } catch {
    return null;
  }
}
