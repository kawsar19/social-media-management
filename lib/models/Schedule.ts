import mongoose, { Schema, Document } from "mongoose";

export interface ISchedule extends Document {
  userId: mongoose.Types.ObjectId;
  postId: mongoose.Types.ObjectId;
  accountIds: mongoose.Types.ObjectId[];
  scheduledAt: Date;
  status: "pending" | "sent" | "failed";
  error?: string;
  createdAt: Date;
}

const ScheduleSchema = new Schema<ISchedule>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    postId: { type: Schema.Types.ObjectId, ref: "Post", required: true },
    accountIds: { type: [Schema.Types.ObjectId], required: true },
    scheduledAt: { type: Date, required: true },
    status: { type: String, required: true, enum: ["pending", "sent", "failed"], default: "pending" },
    error: { type: String },
  },
  { timestamps: true }
);

ScheduleSchema.index({ userId: 1, scheduledAt: 1 });
ScheduleSchema.index({ status: 1 });

export default mongoose.models.Schedule || mongoose.model<ISchedule>("Schedule", ScheduleSchema);