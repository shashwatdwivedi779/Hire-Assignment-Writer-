const Assignment = require('../model/assigment');
const Proposal = require('../model/proposal');
const Notification = require('../model/notification');
const { createNotification } = require('../utils/notify');
const { uploadFile, deleteFile, getSignedUrl } = require("../services/s3.service");

// We attach io to req in app.js via middleware
const getIo = (req) => req.app.get('io');

// ─── Client: Create Assignment ────────────────────────────────────────────────

exports.GetCreate = (req, res) => {
    res.render('creatAP', { error: null });
};

exports.PostCreate = async (req, res) => {
    try {
        const {
            title, subject, topic, description, pages,
            additionalInstructions, deadline, writerLanguage,
            requiredSkills, college,
        } = req.body;

        const budgetValue = parseInt(req.body.budgetRange) || 400;
        const budgetMin = budgetValue;
        const budgetMax = Math.round(budgetValue * 1.3);

        const now = new Date();
        const deadlineDate = new Date(deadline);
        const diffHours = (deadlineDate - now) / (1000 * 60 * 60);
        let urgency = 'normal';
        if (diffHours < 12) urgency = 'critical';
        else if (diffHours <= 36) urgency = 'urgent';

        const questionFiles = [];
        for (const f of req.files?.questionFiles || []) {
            const uploaded = await uploadFile(f, "assignments");
            questionFiles.push({
                key: uploaded.key,
                originalName: f.originalname,
            });
        }

        const referenceFiles = [];
        for (const f of req.files?.referenceFiles || []) {
            const uploaded = await uploadFile(f, "assignments");
            referenceFiles.push({
                key: uploaded.key,
                originalName: f.originalname,
            });
        }

        // College from user profile (trusted), not form (for security)
        const user = res.locals.user;
        const assignmentCollege = college || user.college;

        const assignment = await Assignment.create({
            student: req.userId,
            college: assignmentCollege,
            title,
            subject,
            topic,
            description,
            pages: Number(pages),
            additionalInstructions: additionalInstructions || '',
            questionFiles,
            referenceFiles,
            deadline: deadlineDate,
            budget: { min: budgetMin, max: budgetMax },
            urgency,
            writerLanguage,
            requiredSkills: requiredSkills
                ? requiredSkills.split(',').map(s => s.trim()).filter(Boolean)
                : [],
            status: 'open',
        });

        return res.redirect('/my-assignments');

    } catch (err) {
        console.error('PostCreate error:', err);
        return res.status(500).json({ success: false, message: 'Failed to create assignment.', error: err.message });
    }
};

// ─── Client: Edit Assignment ──────────────────────────────────────────────────

exports.GetEdit = async (req, res) => {
    try {
        const assignment = await Assignment.findOne({ _id: req.params.id, student: req.userId }).lean();
        if (!assignment) return res.status(404).render('errors', { message: 'Assignment not found.' });
        if (assignment.status !== 'open') {
            return res.status(400).render('errors', { message: 'Only open assignments can be edited.' });
        }
        
        for (const file of assignment.questionFiles || []) {
            if (file.key) file.url = await getSignedUrl(file.key);
        }
        for (const file of assignment.referenceFiles || []) {
            if (file.key) file.url = await getSignedUrl(file.key);
        }

        res.render('client/editAssignment', { user: res.locals.user, assignment });
    } catch (err) {
        res.status(500).render('errors', { message: 'Error loading assignment.' });
    }
};

exports.PostEdit = async (req, res) => {
    try {
        const { title, description, deadline, requiredSkills } = req.body;
        const assignment = await Assignment.findOne({ _id: req.params.id, student: req.userId });
        if (!assignment) return res.status(404).json({ success: false, message: 'Not found.' });
        if (assignment.status !== 'open') {
            return res.status(400).json({ success: false, message: 'Cannot edit non-open assignment.' });
        }

        assignment.title = title;
        assignment.description = description;
        assignment.deadline = new Date(deadline);
        assignment.requiredSkills = requiredSkills
            ? requiredSkills.split(',').map(s => s.trim()).filter(Boolean)
            : [];

        await assignment.save();
        return res.json({ success: true, message: 'Assignment updated.' });
    } catch (err) {
        console.error('PostEdit error:', err);
        return res.status(500).json({ success: false, message: 'Error updating assignment.' });
    }
};

// ─── Client: Delete Assignment ────────────────────────────────────────────────

exports.DeleteAssignment = async (req, res) => {
    try {
        const assignment = await Assignment.findOne({ _id: req.params.id, student: req.userId });
        if (!assignment) return res.status(404).json({ success: false, message: 'Not found.' });
        if (!['open', 'cancelled'].includes(assignment.status)) {
            return res.status(400).json({ success: false, message: 'Cannot delete an active assignment.' });
        }

        for (const file of assignment.questionFiles || []) {
            if (file.key) await deleteFile(file.key);
        }
        for (const file of assignment.referenceFiles || []) {
            if (file.key) await deleteFile(file.key);
        }

        await Proposal.deleteMany({ assignment: assignment._id });
        await assignment.deleteOne();

        return res.json({ success: true, message: 'Assignment deleted.' });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Error deleting assignment.' });
    }
};

// ─── Client: Close Assignment ─────────────────────────────────────────────────

exports.CloseAssignment = async (req, res) => {
    try {
        const assignment = await Assignment.findOneAndUpdate(
            { _id: req.params.id, student: req.userId, status: 'open' },
            { status: 'cancelled' },
            { new: true }
        );
        if (!assignment) return res.status(404).json({ success: false, message: 'Not found or not open.' });
        return res.json({ success: true, message: 'Assignment closed.' });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Error closing assignment.' });
    }
};

// ─── Client: View Proposals for an Assignment ─────────────────────────────────

exports.GetProposals = async (req, res) => {
    try {
        const assignment = await Assignment.findOne({ _id: req.params.id, student: req.userId }).lean();
        if (!assignment) return res.status(404).render('errors', { message: 'Not found.' });

        const proposals = await Proposal.find({ assignment: assignment._id })
            .populate('writer', 'name avatar bio skills college')
            .sort({ createdAt: -1 })
            .lean();

        return res.render('client/proposals', {
            user: res.locals.user,
            assignment,
            proposals,
            unreadNotifCount: await Notification.countDocuments({ recipient: req.userId, isRead: false }),
        });
    } catch (err) {
        res.status(500).render('errors', { message: 'Error loading proposals.' });
    }
};

// ─── Client: Accept Proposal ─────────────────────────────────────────────────

exports.AcceptProposal = async (req, res) => {
    try {
        const io = getIo(req);

        const proposal = await Proposal.findById(req.params.proposalId)
            .populate('assignment')
            .populate('writer', 'name');

        if (!proposal) return res.status(404).json({ success: false, message: 'Proposal not found.' });
        if (proposal.client.toString() !== req.userId) {
            return res.status(403).json({ success: false, message: 'Access denied.' });
        }

        // Accept this proposal
        proposal.status = 'accepted';
        await proposal.save();

        // Reject all other proposals for this assignment
        await Proposal.updateMany(
            { assignment: proposal.assignment._id, _id: { $ne: proposal._id }, status: 'pending' },
            { status: 'rejected' }
        );

        // Update assignment status and sync proposalCount
        await Assignment.findByIdAndUpdate(proposal.assignment._id, {
            status: 'assigned',
            assignedWriter: proposal.writer._id,
            acceptedProposal: proposal._id,
            proposalCount: 1, // Reset to 1 since only the accepted one counts
        });

        // Notify the writer
        await createNotification(io, {
            recipient: proposal.writer._id,
            sender: req.userId,
            type: 'proposal_accepted',
            message: `Your proposal for "${proposal.assignment.title}" was accepted! 🎉`,
            link: `/assignment/${proposal.assignment._id}`,
        });

        return res.json({ success: true, message: 'Proposal accepted! Writer notified.' });

    } catch (err) {
        console.error('AcceptProposal error:', err);
        return res.status(500).json({ success: false, message: 'Error accepting proposal.' });
    }
};

// ─── Client: Reject Proposal ─────────────────────────────────────────────────

exports.RejectProposal = async (req, res) => {
    try {
        const io = getIo(req);

        const proposal = await Proposal.findOne({
            _id: req.params.proposalId,
            client: req.userId,
        }).populate('assignment', 'title');

        if (!proposal) return res.status(404).json({ success: false, message: 'Not found.' });

        proposal.status = 'rejected';
        await proposal.save();

        // Decrement proposal count on assignment
        await Assignment.findByIdAndUpdate(proposal.assignment._id, {
            $inc: { proposalCount: -1 }
        });

        await createNotification(io, {
            recipient: proposal.writer,
            sender: req.userId,
            type: 'proposal_rejected',
            message: `Your proposal for "${proposal.assignment.title}" was not selected this time.`,
            link: '/dashboard',
        });

        return res.json({ success: true, message: 'Proposal rejected.' });

    } catch (err) {
        return res.status(500).json({ success: false, message: 'Error rejecting proposal.' });
    }
};

// ─── Client: Mark Completed ───────────────────────────────────────────────────

exports.MarkCompleted = async (req, res) => {
    try {
        const io = getIo(req);
        const { rating, review } = req.body;

        const assignment = await Assignment.findOne({
            _id: req.params.id,
            student: req.userId,
            status: 'submitted',
        });
        if (!assignment) return res.status(404).json({ success: false, message: 'Not found or not submitted.' });

        assignment.status = 'completed';
        assignment.clientRating = { rating: Number(rating) || null, review: review || '' };
        await assignment.save();

        // Mark latest submission as approved
        await require('../model/submission').findOneAndUpdate(
            { assignment: assignment._id, status: 'submitted' },
            { status: 'approved' },
            { sort: { createdAt: -1 } }
        );

        await createNotification(io, {
            recipient: assignment.assignedWriter,
            sender: req.userId,
            type: 'assignment_completed',
            message: `"${assignment.title}" has been marked as completed! ✅`,
            link: `/assignment/${assignment._id}`,
        });

        return res.json({ success: true, message: 'Assignment marked as completed.' });

    } catch (err) {
        return res.status(500).json({ success: false, message: 'Error completing assignment.' });
    }
};
