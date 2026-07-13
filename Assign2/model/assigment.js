const mongoose = require("mongoose");

const assignmentSchema = new mongoose.Schema(
  {
    // Owner (Client who posted)
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Users",
      required: true,
    },

    // College filter for writer marketplace
    college: {
      type: String,
      required: true,
    },

    // Step 1 - Basic Info
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },

    subject: {
      type: String,
      required: true,
      trim: true,
    },

    topic: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      required: true,
      maxlength: 5000,
    },

    pages: {
      type: Number,
      required: true,
      min: 1,
    },

    requiredSkills: {
      type: [String],
      default: [],
    },

    // Step 2 - Attachments
    questionFiles: [
      {
        key: String,
        originalName: String,
      },
    ],

    referenceFiles: [
      {
        key: String,
        originalName: String,
      },
    ],

    additionalInstructions: {
      type: String,
      maxlength: 3000,
      default: "",
    },

    // Step 3 - Deadline & Budget
    deadline: {
      type: Date,
      required: true,
    },

    budget: {
      min: {
        type: Number,
        required: true,
      },
      max: {
        type: Number,
        required: true,
      },
    },

    urgency: {
      type: String,
      enum: ["normal", "urgent", "critical"],
      default: "normal",
    },

    // Step 4 - Preferences
    writerLanguage: {
      type: String,
      enum: ["English", "Hindi", "Both"],
      default: "Both",
    },

    // Assigned writer (populated when proposal accepted)
    assignedWriter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Users",
      default: null,
    },

    // Accepted proposal reference
    acceptedProposal: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Proposal",
      default: null,
    },

    // Order Status
    status: {
      type: String,
      enum: [
        "open",        // visible in marketplace
        "in_review",   // proposals received, client reviewing
        "assigned",    // writer accepted
        "in_progress", // writer working
        "submitted",   // writer submitted work
        "completed",   // client approved
        "cancelled",   // cancelled
      ],
      default: "open",
    },

    // Submission from writer
    submissions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Submission",
      },
    ],

    // Proposal count cache
    proposalCount: {
      type: Number,
      default: 0,
    },

    // Client rating after completion
    clientRating: {
      rating: { type: Number, min: 1, max: 5, default: null },
      review: { type: String, default: "" },
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for marketplace filtering
assignmentSchema.index({ college: 1, status: 1 });
assignmentSchema.index({ student: 1 });
assignmentSchema.index({ status: 1, deadline: 1 });

module.exports = mongoose.model("Assignment", assignmentSchema);