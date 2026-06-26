const Users = require('../model/users');
const Assignment = require('../model/assigment');
const Proposal = require('../model/proposal');
const Notification = require('../model/notification');

// ─── Admin Dashboard ──────────────────────────────────────────────────────────

exports.GetAdminDashboard = async (req, res) => {
    try {
        const [
            totalUsers, totalWriters, totalClients,
            totalAssignments, activeProjects, completedProjects,
            recentUsers, recentAssignments,
        ] = await Promise.all([
            Users.countDocuments(),
            Users.countDocuments({ role: 'writer' }),
            Users.countDocuments({ role: 'client' }),
            Assignment.countDocuments(),
            Assignment.countDocuments({ status: { $in: ['in_progress', 'assigned'] } }),
            Assignment.countDocuments({ status: 'completed' }),
            Users.find().sort({ createdAt: -1 }).limit(10).select('name email role college createdAt').lean(),
            Assignment.find().sort({ createdAt: -1 }).limit(10)
                .populate('student', 'name college').lean(),
        ]);

        // College-wise breakdowns
        const recUsers = await Users.countDocuments({ college: 'REC Rewa' });
        const igecUsers = await Users.countDocuments({ college: 'IGEC Sagar' });
        const recAssignments = await Assignment.countDocuments({ college: 'REC Rewa' });
        const igecAssignments = await Assignment.countDocuments({ college: 'IGEC Sagar' });

        return res.render('admin/dashboard', {
            user: res.locals.user,
            stats: {
                totalUsers, totalWriters, totalClients,
                totalAssignments, activeProjects, completedProjects,
                recUsers, igecUsers, recAssignments, igecAssignments,
            },
            recentUsers,
            recentAssignments,
            unreadNotifCount: 0,
        });

    } catch (err) {
        console.error('Admin Dashboard error:', err);
        res.status(500).render('errors', { message: 'Admin dashboard error.' });
    }
};

// ─── Admin: User Management ───────────────────────────────────────────────────

exports.GetUsers = async (req, res) => {
    try {
        const { role, college, search } = req.query;
        const filter = {};
        if (role) filter.role = role;
        if (college) filter.college = college;
        if (search) filter.$or = [
            { name: { $regex: search, $options: 'i' } },
            { email: { $regex: search, $options: 'i' } },
        ];

        const users = await Users.find(filter).sort({ createdAt: -1 }).lean();

        return res.render('admin/users', {
            user: res.locals.user,
            users,
            filters: { role, college, search },
            unreadNotifCount: 0,
        });
    } catch (err) {
        res.status(500).render('errors', { message: 'Error loading users.' });
    }
};

exports.DeleteUser = async (req, res) => {
    try {
        const userId = req.params.id;

        // Cascade delete related records
        await Promise.all([
            Users.findByIdAndDelete(userId),
            Assignment.deleteMany({ student: userId }), // Delete assignments posted by client
            Proposal.deleteMany({ writer: userId }),   // Delete proposals by writer
            Notification.deleteMany({ $or: [{ recipient: userId }, { sender: userId }] }),
        ]);

        return res.json({ success: true, message: 'User and related records deleted.' });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Error deleting user.' });
    }
};

// ─── Admin: Assignment Management ────────────────────────────────────────────

exports.GetAssignments = async (req, res) => {
    try {
        const { status, college } = req.query;
        const filter = {};
        if (status) filter.status = status;
        if (college) filter.college = college;

        const assignments = await Assignment.find(filter)
            .populate('student', 'name college')
            .sort({ createdAt: -1 })
            .lean();

        return res.render('admin/assignments', {
            user: res.locals.user,
            assignments,
            filters: { status, college },
            unreadNotifCount: 0,
        });
    } catch (err) {
        res.status(500).render('errors', { message: 'Error loading assignments.' });
    }
};

exports.AdminDeleteAssignment = async (req, res) => {
    try {
        const assignmentId = req.params.id;
        const mongoose = require('mongoose');
        const Submission = require('../model/submission');

        await Promise.all([
            Assignment.findByIdAndDelete(assignmentId),
            Proposal.deleteMany({ assignment: assignmentId }),
            Submission.deleteMany({ assignment: assignmentId }),
        ]);

        return res.json({ success: true, message: 'Assignment and related records deleted.' });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Error deleting assignment.' });
    }
};

// ─── Admin: Proposals ─────────────────────────────────────────────────────────

exports.GetProposals = async (req, res) => {
    try {
        const proposals = await Proposal.find()
            .populate('writer', 'name college')
            .populate('assignment', 'title status')
            .sort({ createdAt: -1 })
            .limit(100)
            .lean();

        return res.render('admin/proposals', {
            user: res.locals.user,
            proposals,
            unreadNotifCount: 0,
        });
    } catch (err) {
        res.status(500).render('errors', { message: 'Error loading proposals.' });
    }
};
