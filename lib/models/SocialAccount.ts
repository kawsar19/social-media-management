import mongoose, { Schema, Document } from "mongoose";

export interface ISocialAccount extends Document {
  userId: mongoose.Types.ObjectId;
  platform: "linkedin" | "facebook" | "youtube" | "instagram" | "threads";
  platformId: string;
  platformName: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scope?: string;
  connectedAt: Date;
}

const SocialAccountSchema = new Schema<ISocialAccount>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    platform: {
      type: String,
      required: true,
      enum: ["linkedin", "facebook", "youtube", "instagram", "threads"],
    },
    platformId: { type: String, required: true },
    platformName: { type: String, required: true },
    accessToken: { type: String, required: true },
    refreshToken: { type: String },
    expiresAt: { type: Date },
    scope: { type: String },
    connectedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

SocialAccountSchema.index({ userId: 1, platform: 1 }, { unique: true });
SocialAccountSchema.index({ userId: 1 });

export default mongoose.models.SocialAccount || mongoose.model<ISocialAccount>("SocialAccount", SocialAccountSchema);