import mongoose, { Schema, Document } from "mongoose";

// An AutoPost is a standing instruction: "every day at this time, write a post
// about this and publish it to these places". Unlike Schedule — which fires one
// already-written Post once — an AutoPost holds a *prompt*, and each run asks
// the model for fresh content before publishing.
//
// The cron route (/api/cron) is what advances these: it finds the ones that are
// due, generates, publishes, and stamps the result back here.

export type AutoPostFrequency = "daily" | "weekly";

// Where a generated post goes. Mirrors IPostTarget's addressing fields (the
// publish pipeline needs the same platform/destination pair), but carries none
// of the per-publish result fields — those belong to the Post each run creates.
export interface IAutoPostTarget {
  platform: "linkedin" | "facebook" | "instagram" | "threads" | "youtube";
  accountId?: mongoose.Types.ObjectId;
  accountName?: string;
  destinationId?: string;
  destinationName?: string;
}

// One run's outcome, kept so the UI can show "what did it actually post?"
// without joining against Post for the common case. postId links to the full
// record when one was created.
export interface IAutoPostRun {
  runAt: Date;
  status: "published" | "partial" | "failed" | "skipped";
  postId?: mongoose.Types.ObjectId;
  excerpt?: string; // first ~200 chars of what went out, for the history list
  error?: string;
}

export interface IAutoPost extends Document {
  userId: mongoose.Types.ObjectId;
  name: string; // what the user calls this automation
  prompt: string; // the standing brief handed to the model each run

  // Generation options — the same vocabulary /api/ai/write-post accepts, so a
  // saved automation produces posts identical to what the composer would.
  language: "english" | "bangla" | "banglish";
  tone: "professional" | "casual" | "friendly" | "excited" | "informative" | "funny";
  length: "short" | "medium" | "long";
  hashtags: boolean;
  emojis: boolean;

  targets: IAutoPostTarget[];

  // Schedule. `timeOfDay` is "HH:MM" in `timezone`, NOT UTC — a user who says
  // 9am means 9am where they are, and that maps to a different UTC instant when
  // their offset changes. Resolving it per-run against the zone keeps it right.
  frequency: AutoPostFrequency;
  timeOfDay: string; // "HH:MM", 24-hour
  timezone: string; // IANA zone, e.g. "Asia/Dhaka"
  daysOfWeek: number[]; // 0=Sun..6=Sat; only read when frequency === "weekly"

  enabled: boolean;

  // Run bookkeeping. lastRunKey is the de-duplication guard: it stores the
  // occurrence slot that was last handled ("2026-08-15T09:00" in local terms),
  // so a cron that fires several times inside the same slot — or retries after
  // a timeout — can't publish the same day twice.
  lastRunKey?: string;
  lastRunAt?: Date;
  runs: IAutoPostRun[];

  createdAt: Date;
  updatedAt: Date;
}

const AutoPostTargetSchema = new Schema<IAutoPostTarget>(
  {
    platform: {
      type: String,
      required: true,
      enum: ["linkedin", "facebook", "instagram", "threads", "youtube"],
    },
    accountId: { type: Schema.Types.ObjectId, ref: "SocialAccount" },
    accountName: { type: String },
    destinationId: { type: String },
    destinationName: { type: String },
  },
  { _id: false }
);

const AutoPostRunSchema = new Schema<IAutoPostRun>(
  {
    runAt: { type: Date, required: true },
    status: {
      type: String,
      required: true,
      enum: ["published", "partial", "failed", "skipped"],
    },
    postId: { type: Schema.Types.ObjectId, ref: "Post" },
    excerpt: { type: String },
    error: { type: String },
  },
  { _id: false }
);

const AutoPostSchema = new Schema<IAutoPost>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true, default: "Untitled automation" },
    prompt: { type: String, required: true },

    language: {
      type: String,
      enum: ["english", "bangla", "banglish"],
      default: "english",
    },
    tone: {
      type: String,
      enum: ["professional", "casual", "friendly", "excited", "informative", "funny"],
      default: "professional",
    },
    length: { type: String, enum: ["short", "medium", "long"], default: "medium" },
    hashtags: { type: Boolean, default: true },
    emojis: { type: Boolean, default: true },

    targets: { type: [AutoPostTargetSchema], default: [] },

    frequency: { type: String, enum: ["daily", "weekly"], default: "daily" },
    timeOfDay: { type: String, required: true, default: "09:00" },
    timezone: { type: String, required: true, default: "Asia/Dhaka" },
    daysOfWeek: { type: [Number], default: [] },

    enabled: { type: Boolean, default: true },

    lastRunKey: { type: String },
    lastRunAt: { type: Date },
    // Capped at the 20 most recent by the cron route — this is a history strip
    // in the UI, not an audit log, and an unbounded array would grow forever.
    runs: { type: [AutoPostRunSchema], default: [] },
  },
  { timestamps: true }
);

AutoPostSchema.index({ userId: 1, createdAt: -1 });
// The cron's lookup: every enabled automation, cheaply.
AutoPostSchema.index({ enabled: 1 });

export default mongoose.models.AutoPost ||
  mongoose.model<IAutoPost>("AutoPost", AutoPostSchema);
