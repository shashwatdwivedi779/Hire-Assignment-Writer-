const mongoose = require("mongoose");

/**
 * Conversation Schema
 * A 1-to-1 conversation thread between two users (client & writer).
 * Linked to an assignment so context is preserved.
 */
const conversationSchema = new mongoose.Schema(
  {
    // The two participants (always exactly 2)
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Users",
      },
    ],

    // Optional: which assignment this chat relates to
    assignment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Assignment",
      default: null,
    },

    // Last message preview (for inbox list display)
    lastMessage: {
      type: String,
      default: "",
    },

    lastMessageAt: {
      type: Date,
      default: Date.now,
    },

    // Unread count per participant: { userId: count }
    unreadCount: {
      type: Map,
      of: Number,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

conversationSchema.index({ participants: 1 });
conversationSchema.index({ lastMessageAt: -1 });

module.exports = mongoose.model("Conversation", conversationSchema);
