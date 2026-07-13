const mongoose = require("mongoose");

/**
 * Message Schema
 * Individual messages within a Conversation.
 */
const messageSchema = new mongoose.Schema(
  {
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
    },

    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Users",
      required: true,
    },

    // Text content of the message
    text: {
      type: String,
      maxlength: 2000,
      default: "",
    },

    // Attached file (if any)
    file: {
      url: { type: String, default: null },
      key: String,
      originalName: { type: String, default: null },
      mimetype: { type: String, default: null },
    },

    // Message type: text | image | pdf | file
    type: {
      type: String,
      enum: ["text", "image", "pdf", "file"],
      default: "text",
    },

    // Read receipts: array of userIds who have read this message
    readBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Users",
      },
    ],

    // Soft delete
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

messageSchema.index({ conversation: 1, createdAt: 1 });
messageSchema.index({ sender: 1 });

module.exports = mongoose.model("Message", messageSchema);
