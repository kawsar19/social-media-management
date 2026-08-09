import mongoose, { Schema, Document } from "mongoose";

// A Post is one piece of content authored once and published to one or more
// social platforms ("targets"). Each target tracks WHERE it went (platform +
// account/destination) and its own publish result (status, platform post id,
// permalink, error) — so a single post can be half-published (partial) and we
// still know exactly which destinations succeeded or failed.

export type PostStatus =
  | "draft"
  | "scheduled"
  | "publishing"
  | "published"
  | "partial"
  | "failed";

export type TargetStatus = "pending" | "success" | "failed" | "skipped";

// One publish destination for a post. destinationId/Name distinguish sub-targets
// that differ from the account itself — e.g. a specific Facebook Page or the
// chosen Instagram account — so "where did this go" is unambiguous.
export interface IPostTarget {
  platform: "linkedin" | "facebook" | "instagram" | "threads" | "youtube";
  accountId?: mongoose.Types.ObjectId; // ref SocialAccount (the connection used)
  accountName?: string; // snapshot of the account/channel name at publish time
  destinationId?: string; // FB Page id / IG user id / YT channel id, when relevant
  destinationName?: string; // FB Page name / IG @username, when relevant
  status: TargetStatus;
  platformPostId?: string; // id returned by the platform on success
  permalink?: string; // public URL of the published post, when derivable
  error?: string; // failure reason when status === "failed"
  publishedAt?: Date;
}

export interface IPost extends Document {
  userId: mongoose.Types.ObjectId;
  content: string;
  // R2 URL (used by IG/Threads and as a preview). Videos are deleted from R2
  // after publishing, so this can point at an object that no longer exists when
  // mediaType is "video"; images are kept.
  mediaUrl?: string;
  mediaType?: "image" | "video"; // what mediaUrl points at
  // YouTube-specific fields (only meaningful when a video target is present).
  youtubeTitle?: string;
  youtubePrivacy?: "private" | "unlisted" | "public";
  status: PostStatus;
  targets: IPostTarget[];
  scheduledAt?: Date; // set when status === "scheduled" (auto-fire is a later step)
  publishedAt?: Date; // when the post first reached "published"/"partial"
  createdAt: Date;
  updatedAt: Date;
}

const PostTargetSchema = new Schema<IPostTarget>(
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
    status: {
      type: String,
      required: true,
      enum: ["pending", "success", "failed", "skipped"],
      default: "pending",
    },
    platformPostId: { type: String },
    permalink: { type: String },
    error: { type: String },
    publishedAt: { type: Date },
  },
  { _id: false }
);

const PostSchema = new Schema<IPost>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    content: { type: String, default: "" },
    mediaUrl: { type: String },
    mediaType: { type: String, enum: ["image", "video"] },
    youtubeTitle: { type: String },
    youtubePrivacy: { type: String, enum: ["private", "unlisted", "public"] },
    status: {
      type: String,
      required: true,
      enum: ["draft", "scheduled", "publishing", "published", "partial", "failed"],
      default: "draft",
    },
    targets: { type: [PostTargetSchema], default: [] },
    scheduledAt: { type: Date },
    publishedAt: { type: Date },
  },
  { timestamps: true }
);

PostSchema.index({ userId: 1, createdAt: -1 });
PostSchema.index({ userId: 1, status: 1, scheduledAt: 1 });

export default mongoose.models.Post || mongoose.model<IPost>("Post", PostSchema);
