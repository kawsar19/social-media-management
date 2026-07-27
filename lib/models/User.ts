import mongoose, { Schema, Document } from "mongoose";

export interface IUser extends Document {
  email: string;
  name: string;
  password: string;
  createdAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    password: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

UserSchema.index({ email: 1 });

export default mongoose.models.User || mongoose.model<IUser>("User", UserSchema);