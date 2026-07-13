const mongoose = require("mongoose");

/**
 * Submission Schema
 * Writer submits completed work files for an assignment.
 */
const submissionSchema = new mongoose.Schema(
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

    // Files submitted by the writer
    files: [
      {
        key: String,
        originalName: String,
        mimetype: String,
      },
    ],

    // Writer's note with the submission
    note: {
      type: String,
      maxlength: 1000,
      default: "",
    },

    // Submission attempt number (for resubmissions)
    attempt: {
      type: Number,
      default: 1,
    },

    status: {
      type: String,
      enum: [
        "submitted",   // waiting for client review
        "approved",    // client approved, project complete
        "revision",    // client requested revision
      ],
      default: "submitted",
    },

    // Client's revision request note
    revisionNote: {
      type: String,
      maxlength: 1000,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

submissionSchema.index({ assignment: 1, writer: 1 });

module.exports = mongoose.model("Submission", submissionSchema);
