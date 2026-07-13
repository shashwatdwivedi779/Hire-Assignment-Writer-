const mongoose = require("mongoose");

/**
 * Proposal Schema
 * A Writer sends a Proposal on an Assignment (Client's post).
 * One writer can only have ONE active proposal per assignment.
 */
const proposalSchema = new mongoose.Schema(
  {
    assignment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Assignment",
      required: true,
    },

    writer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Users",
      required: true,
    },

    client: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Users",
      required: true,
    },

    // Writer's cover letter / proposal message
    coverLetter: {
      type: String,
      required: true,
      maxlength: 2000,
    },

    // Writer's proposed price
    bidAmount: {
      type: Number,
      required: true,
      min: 100,
    },

    // Writer's estimated delivery time (in hours)
    deliveryTime: {
      type: Number,
      required: true,
      min: 1,
    },

    status: {
      type: String,
      enum: [
        "pending",    // submitted, awaiting client decision
        "accepted",   // client accepted this proposal
        "rejected",   // client rejected
        "withdrawn",  // writer withdrew proposal
      ],
      default: "pending",
    },
  },
  {
    timestamps: true,
  }
);

// A writer can only submit one proposal per assignment
proposalSchema.index({ assignment: 1, writer: 1 }, { unique: true });
proposalSchema.index({ writer: 1, status: 1 });
proposalSchema.index({ client: 1 });

module.exports = mongoose.model("Proposal", proposalSchema);
