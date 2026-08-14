import mongoose, { Schema, Document } from "mongoose";

// A user is created either by /api/auth/register (email + password) or by
// /api/auth/google (Google Sign-In). Google users never set a password, so
// `password` is optional and only required when provider is "credentials".
export interface IUser extends Document {
  email: string;
  name: string;
  password?: string;
  provider: "credentials" | "google";
  googleId?: string;
  avatar?: string;
  createdAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    password: {
      type: String,
      required: function (this: IUser) {
        return this.provider === "credentials";
      },
    },
    provider: {
      type: String,
      enum: ["credentials", "google"],
      default: "credentials",
    },
    // Google's stable subject id. Sparse so the unique index ignores the
    // password users that have no googleId at all.
    googleId: { type: String, unique: true, sparse: true },
    avatar: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

UserSchema.index({ email: 1 });

export default mongoose.models.User || mongoose.model<IUser>("User", UserSchema);
