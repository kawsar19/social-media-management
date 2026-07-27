import mongoose, { Schema, Document } from "mongoose";

export interface IInsight extends Document {
  userId: mongoose.Types.ObjectId;
  accountId: mongoose.Types.ObjectId;
  platform: string;
  metric: string;
  value: number;
  period: string;
  date: Date;
  createdAt: Date;
}

const InsightSchema = new Schema<IInsight>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    accountId: { type: Schema.Types.ObjectId, ref: "SocialAccount", required: true },
    platform: { type: String, required: true },
    metric: { type: String, required: true },
    value: { type: Number, required: true },
    period: { type: String, required: true },
    date: { type: Date, required: true },
  },
  { timestamps: true }
);

InsightSchema.index({ accountId: 1, date: -1 });
InsightSchema.index({ userId: 1, platform: 1, date: -1 });

export default mongoose.models.Insight || mongoose.model<IInsight>("Insight", InsightSchema);