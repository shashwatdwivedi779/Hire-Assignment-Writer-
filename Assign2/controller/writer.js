const Assignment = require('../model/assigment');
const Proposal = require('../model/proposal');
const Submission = require('../model/submission');
const Notification = require('../model/notification');
const { createNotification } = require('../utils/notify');
const { uploadFile, deleteFile, getSignedUrl } = require("../services/s3.service");

const getIo = (req) => req.app.get('io');

// ─── Writer: Submit Proposal ──────────────────────────────────────────────────

exports.PostProposal = async (req, res) => {
    try {
        const { assignmentId, coverLetter, bidAmount, deliveryTime } = req.body;
        const user = res.locals.user;

        if (user.role !== 'writer') {
            return res.status(403).json({ success: false, message: 'Only writers can submit proposals.' });
        }

        const assignment = await Assignment.findById(assignmentId);
        if (!assignment || assignment.status !== 'open') {
            return res.status(400).json({ success: false, message: 'Assignment not available.' });
        }

        // Prevent duplicate proposals
        const existing = await Proposal.findOne({ assignment: assignmentId, writer: req.userId });
        if (existing) {
            return res.status(409).json({ success: false, message: 'You have already proposed on this assignment.' });
        }

        const proposal = await Proposal.create({
            assignment: assignmentId,
            writer: req.userId,
            client: assignment.student,
            coverLetter,
            bidAmount: Number(bidAmount),
            deliveryTime: Number(deliveryTime),
            status: 'pending',
        });

        // Increment proposal count
        await Assignment.findByIdAndUpdate(assignmentId, { $inc: { proposalCount: 1 } });

        // Notify client
        const io = getIo(req);
        await createNotification(io, {
            recipient: assignment.student,
            sender: req.userId,
            type: 'new_proposal',
            message: `${user.name} sent a proposal for "${assignment.title}"`,
            link: `/assignment/${assignmentId}/proposals`,
        });

        return res.json({ success: true, message: 'Proposal submitted successfully!', proposal });

    } catch (err) {
        console.error('PostProposal error:', err);
        if (err.code === 11000) {
            return res.status(409).json({ success: false, message: 'You already submitted a proposal.' });
        }
        return res.status(500).json({ success: false, message: 'Error submitting proposal.' });
    }
};

// ─── Writer: Edit Proposal ────────────────────────────────────────────────────

exports.PutProposal = async (req, res) => {
    try {
        const { coverLetter, bidAmount, deliveryTime } = req.body;
        const proposal = await Proposal.findOne({ _id: req.params.id, writer: req.userId });
        if (!proposal) return res.status(404).json({ success: false, message: 'Proposal not found.' });
        if (proposal.status !== 'pending') {
            return res.status(400).json({ success: false, message: 'Cannot edit a non-pending proposal.' });
        }

        proposal.coverLetter = coverLetter;
        proposal.bidAmount = Number(bidAmount);
        proposal.deliveryTime = Number(deliveryTime);
        await proposal.save();

        return res.json({ success: true, message: 'Proposal updated.' });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Error updating proposal.' });
    }
};

// ─── Writer: Withdraw Proposal ────────────────────────────────────────────────

exports.WithdrawProposal = async (req, res) => {
    try {
        const proposal = await Proposal.findOne({ _id: req.params.id, writer: req.userId });
        if (!proposal) return res.status(404).json({ success: false, message: 'Proposal not found.' });
        if (proposal.status !== 'pending') {
            return res.status(400).json({ success: false, message: 'Only pending proposals can be withdrawn.' });
        }

        proposal.status = 'withdrawn';
        await proposal.save();

        await Assignment.findByIdAndUpdate(proposal.assignment, { $inc: { proposalCount: -1 } });

        return res.json({ success: true, message: 'Proposal withdrawn.' });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Error withdrawing proposal.' });
    }
};

// ─── Writer: My Proposals ─────────────────────────────────────────────────────

exports.GetMyProposals = async (req, res) => {
    try {
        if (!req.isLoggedIn) return res.redirect('/login');
        const user = res.locals.user;
        const { status } = req.query;

        const filter = { writer: req.userId };
        if (status) filter.status = status;

        const proposals = await Proposal.find(filter)
            .populate('assignment', 'title subject status deadline budget college')
            .sort({ createdAt: -1 })
            .lean();

        return res.render('writer/myProposals', {
            user,
            proposals,
            activeStatus: status || 'all',
            unreadNotifCount: await Notification.countDocuments({ recipient: user._id, isRead: false }),
        });
    } catch (err) {
        res.status(500).render('errors', { message: 'Error loading proposals.' });
    }
};

// ─── Writer: Submit Work ──────────────────────────────────────────────────────

exports.PostSubmission = async (req, res) => {
    try {
        const io = getIo(req);
        const { assignmentId, note } = req.body;
        const user = res.locals.user;

        const assignment = await Assignment.findOne({
            _id: assignmentId,
            assignedWriter: req.userId,
            status: { $in: ['assigned', 'in_progress'] },
        });

        if (!assignment) {
            return res.status(404).json({ success: false, message: 'Assignment not found or not assigned to you.' });
        }

        const files = [];
        for (const f of req.files?.submissionFiles || []) {
            const uploaded = await uploadFile(f, "submissions");
            files.push({
                key: uploaded.key,
                originalName: f.originalname,
                mimetype: f.mimetype,
            });
        }

        if (files.length === 0) {
            return res.status(400).json({ success: false, message: 'Please upload at least one file.' });
        }

        // Count existing attempts
        const attempt = (await Submission.countDocuments({ assignment: assignmentId, writer: req.userId })) + 1;

        const submission = await Submission.create({
            assignment: assignmentId,
            writer: req.userId,
            client: assignment.student,
            files,
            note: note || '',
            attempt,
            status: 'submitted',
        });

        // Add submission reference & update assignment status
        await Assignment.findByIdAndUpdate(assignmentId, {
            $push: { submissions: submission._id },
            status: 'submitted',
        });

        // Notify client
        await createNotification(io, {
            recipient: assignment.student,
            sender: req.userId,
            type: 'assignment_submitted',
            message: `${user.name} submitted work for "${assignment.title}"`,
            link: `/assignment/${assignmentId}`,
        });

        return res.json({ success: true, message: 'Work submitted successfully!' });

    } catch (err) {
        console.error('PostSubmission error:', err);
        return res.status(500).json({ success: false, message: 'Error submitting work.' });
    }
};

// ─── Writer: Active Work Page ─────────────────────────────────────────────────

exports.GetActiveWork = async (req, res) => {
    try {
        if (!req.isLoggedIn) return res.redirect('/login');
        const user = res.locals.user;

        // Find assignments where writer is assigned
        const assignments = await Assignment.find({
            assignedWriter: req.userId,
            status: { $in: ['assigned', 'in_progress', 'submitted'] },
        })
            .populate('student', 'name avatar college')
            .sort({ deadline: 1 })
            .lean();

        return res.render('writer/activeWork', {
            user,
            assignments,
            unreadNotifCount: await Notification.countDocuments({ recipient: user._id, isRead: false }),
        });

    } catch (err) {
        res.status(500).render('errors', { message: 'Error loading active work.' });
    }
};
