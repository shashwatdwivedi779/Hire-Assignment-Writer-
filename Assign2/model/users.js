const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 50,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },

    college: {
      type: String,
      required: true,
      trim: true,
      enum: ["REC Rewa", "IGEC Sagar"],
    },

    gender: {
      type: String,
      required: true,
      enum: ["male", "female", "others"],
    },

    role: {
      type: String,
      required: true,
      enum: ["client", "writer", "admin"],
    },

    password: {
      type: String,
      required: true,
      minlength: 6,
    },

    // Profile fields
    avatar: {
      type: String,
      default: null,
    },

    bio: {
      type: String,
      maxlength: 500,
      default: "",
    },

    skills: {
      type: [String],
      default: [],
    },

    // Writer-specific
    subjects: {
      type: [String],
      default: [],
    },

    // Online status for real-time presence
    isOnline: {
      type: Boolean,
      default: false,
    },

    lastSeen: {
      type: Date,
      default: Date.now,
    },

    // Notification preferences
    notifyOnMessage: { type: Boolean, default: true },
    notifyOnProposal: { type: Boolean, default: true },
    notifyOnStatus: { type: Boolean, default: true },

    // Reset password token fields
    resetPasswordToken: { type: String, default: null },
    resetPasswordExpires: { type: Date, default: null },

    isVerified: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for fast lookups (email already indexed via unique:true)
UserSchema.index({ college: 1, role: 1 });

module.exports = mongoose.model("Users", UserSchema);