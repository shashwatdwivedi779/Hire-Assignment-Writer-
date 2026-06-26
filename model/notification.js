const mongoose = require("mongoose");

/**
 * Notification Schema
 * Stores in-app notifications for each user.
 */
const notificationSchema = new mongoose.Schema(
  {
    // Who receives this notification
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Users",
      required: true,
    },

    // Who triggered this notification (optional)
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Users",
      default: null,
    },

    type: {
      type: String,
      enum: [
        "new_proposal",       // writer sent a proposal to client
        "proposal_accepted",  // client accepted a writer's proposal
        "proposal_rejected",  // client rejected a writer's proposal
        "new_message",        // new chat message received
        "assignment_submitted", // writer submitted work
        "assignment_completed", // client marked as completed
        "revision_requested", // client requested revision
        "new_assignment",     // new assignment matching writer's college
      ],
      required: true,
    },

    // Human-readable message
    message: {
      type: String,
      required: true,
    },

    // Deep link route for click navigation
    link: {
      type: String,
      default: "/dashboard",
    },

    isRead: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });

module.exports = mongoose.model("Notification", notificationSchema);
