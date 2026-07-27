import mongoose, { Schema, Document } from "mongoose";

export interface IPost extends Document {
  userId: mongoose.Types.ObjectId;
  accountId: mongoose.Types.ObjectId;
  platform: string;
  content: string;
  mediaUrl?: string;
  status: "draft" | "scheduled" | "published" | "failed";
  platformPostId?: string;
  publishedAt?: Date;
  scheduledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const PostSchema = new Schema<IPost>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    accountId: { type: Schema.Types.ObjectId, ref: "SocialAccount", required: true },
    platform: { type: String, required: true },
    content: { type: String, required: true },
    mediaUrl: { type: String },
    status: {
      type: String,
      required: true,
      enum: ["draft", "scheduled", "published", "failed"],
      default: "draft",
    },
    platformPostId: { type: String },
    publishedAt: { type: Date },
    scheduledAt: { type: Date },
  },
  { timestamps: true }
);

PostSchema.index({ userId: 1, status: 1, scheduledAt: 1 });
PostSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.models.Post || mongoose.model<IPost>("Post", PostSchema);