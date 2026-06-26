const Assignment = require('../model/assigment');
const Proposal = require('../model/proposal');
const Submission = require('../model/submission');
const Notification = require('../model/notification');
const Users = require('../model/users');
const { createNotification } = require('../utils/notify');

// ─── Dashboard ────────────────────────────────────────────────────────────────

/**
 * GET /dashboard
 * Shows role-specific dashboard with real DB stats.
 */
exports.GetDashboard = async (req, res) => {
    try {
        if (!req.isLoggedIn) return res.redirect('/login');

        const user = res.locals.user;

        if (user.role === 'client') {
            // --- Client stats ---
            const [
                totalProjects,
                activeProjects,
                pendingProjects,
                completedProjects,
                totalProposals,
                recentAssignments,
                recentNotifications,
            ] = await Promise.all([
                Assignment.countDocuments({ student: user._id }),
                Assignment.countDocuments({ student: user._id, status: { $in: ['assigned', 'in_progress'] } }),
                Assignment.countDocuments({ student: user._id, status: 'open' }),
                Assignment.countDocuments({ student: user._id, status: 'completed' }),
                // Count proposals received ON this client's assignments
                Proposal.countDocuments({ client: user._id, status: 'pending' }),
                Assignment.find({ student: user._id })
                    .sort({ createdAt: -1 })
                    .limit(5)
                    .lean(),
                Notification.find({ recipient: user._id })
                    .sort({ createdAt: -1 })
                    .limit(10)
                    .lean(),
            ]);

            const unreadNotifCount = await Notification.countDocuments({
                recipient: user._id, isRead: false
            });

            return res.render('client/dashboard', {
                user,
                stats: { totalProjects, activeProjects, pendingProjects, completedProjects, totalProposals },
                recentAssignments,
                notifications: recentNotifications,
                unreadNotifCount,
            });

        } else if (user.role === 'writer') {
            // --- Writer stats ---
            const [
                totalProposals,
                acceptedProposals,
                activeProjects,
                completedProjects,
                recentProposals,
                recentNotifications,
            ] = await Promise.all([
                Proposal.countDocuments({ writer: user._id }),
                Proposal.countDocuments({ writer: user._id, status: 'accepted' }),
                // Active projects: assignments actively assigned to this writer
                Assignment.countDocuments({ assignedWriter: user._id, status: { $in: ['assigned', 'in_progress'] } }),
                Submission.countDocuments({ writer: user._id, status: 'approved' }),
                Proposal.find({ writer: user._id })
                    .populate('assignment', 'title subject status deadline budget')
                    .sort({ createdAt: -1 })
                    .limit(5)
                    .lean(),
                Notification.find({ recipient: user._id })
                    .sort({ createdAt: -1 })
                    .limit(10)
                    .lean(),
            ]);

            const totalAssigned = completedProjects + activeProjects;
            const completionRate = totalAssigned > 0
                ? Math.round((completedProjects / totalAssigned) * 100)
                : 100;

            const unreadNotifCount = await Notification.countDocuments({
                recipient: user._id, isRead: false
            });

            return res.render('writer/dashboard', {
                user,
                stats: { totalProposals, acceptedProposals, activeProjects, completedProjects, completionRate },
                recentProposals,
                notifications: recentNotifications,
                unreadNotifCount,
            });

        } else if (user.role === 'admin') {
            return res.redirect('/admin');
        }

    } catch (err) {
        console.error('GetDashboard error:', err);
        res.status(500).render('errors', { message: 'Server error loading dashboard.' });
    }
};

// ─── Assignment Marketplace (Writer View) ────────────────────────────────────

/**
 * GET /marketplace
 * Writers browse open assignments.
 */
exports.GetMarketplace = async (req, res) => {
    try {
        if (!req.isLoggedIn) return res.redirect('/login');
        const user = res.locals.user;

        const { college, minBudget, maxBudget, search, sort } = req.query;

        // Build filter
        const filter = { status: 'open' };

        // FIX: Only filter by college if a specific college is selected. 
        // If 'college' is empty (All Colleges), this simply gets skipped, showing everything.
        if (college) {
            filter.college = college;
        }

        if (minBudget) filter['budget.min'] = { $gte: Number(minBudget) };
        if (maxBudget) filter['budget.max'] = { $lte: Number(maxBudget) };

        if (search) {
            filter.$or = [
                { title: { $regex: search, $options: 'i' } },
                { subject: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
            ];
        }

        // Sort options
        const sortMap = {
            newest: { createdAt: -1 },
            deadline: { deadline: 1 },
            budget: { 'budget.min': -1 },
        };
        const sortQuery = sortMap[sort] || { createdAt: -1 };

        const assignments = await Assignment.find(filter)
            .populate('student', 'name college avatar')
            .sort(sortQuery)
            .limit(30)
            .lean();

        // Check which ones the writer already proposed on
        let myProposalSet = new Set();
        if (user.role === 'writer') {
            const myProposals = await Proposal.find({ writer: user._id }).select('assignment').lean();
            myProposalSet = new Set(myProposals.map(p => p.assignment.toString()));
        }

        const assignmentsWithFlag = assignments.map(a => ({
            ...a,
            alreadyProposed: myProposalSet.has(a._id.toString()),
        }));

        return res.render('marketplace', {
            user,
            assignments: assignmentsWithFlag,
            filters: { college, minBudget, maxBudget, search, sort },
            unreadNotifCount: await Notification.countDocuments({ recipient: user._id, isRead: false }),
        });

    } catch (err) {
        console.error('GetMarketplace error:', err);
        res.status(500).render('errors', { message: 'Error loading marketplace.' });
    }
};

// ─── Assignment Detail ────────────────────────────────────────────────────────

exports.GetAssignmentDetail = async (req, res) => {
    try {
        if (!req.isLoggedIn) return res.redirect('/login');
        const user = res.locals.user;

        const assignment = await Assignment.findById(req.params.id)
            .populate('student', 'name college avatar bio')
            .populate('assignedWriter', 'name avatar')
            .populate({
                path: 'submissions',
                populate: { path: 'writer', select: 'name avatar' },
                options: { sort: { createdAt: -1 } },
            })
            .lean();

        if (!assignment) return res.status(404).render('errors', { message: 'Assignment not found.' });

        // Get proposals (client sees all, writer sees only own)
        let proposals = [];
        let myProposal = null;

        if (user.role === 'client' && assignment.student._id.toString() === user._id.toString()) {
            proposals = await Proposal.find({ assignment: assignment._id })
                .populate('writer', 'name avatar bio skills college')
                .sort({ createdAt: -1 })
                .lean();
        } else if (user.role === 'writer') {
            myProposal = await Proposal.findOne({ assignment: assignment._id, writer: user._id }).lean();
        }

        return res.render('assignment/detail', {
            user,
            assignment,
            proposals,
            myProposal,
            unreadNotifCount: await Notification.countDocuments({ recipient: user._id, isRead: false }),
        });

    } catch (err) {
        console.error('GetAssignmentDetail error:', err);
        res.status(500).render('errors', { message: 'Error loading assignment.' });
    }
};

// ─── My Assignments (Client) ──────────────────────────────────────────────────

exports.GetMyAssignments = async (req, res) => {
    try {
        if (!req.isLoggedIn) return res.redirect('/login');
        const user = res.locals.user;

        const { status } = req.query;
        const filter = { student: user._id };
        if (status) filter.status = status;

        const assignments = await Assignment.find(filter)
            .sort({ createdAt: -1 })
            .lean();

        return res.render('client/myAssignments', {
            user,
            assignments,
            activeStatus: status || 'all',
            unreadNotifCount: await Notification.countDocuments({ recipient: user._id, isRead: false }),
        });

    } catch (err) {
        console.error('GetMyAssignments error:', err);
        res.status(500).render('errors', { message: 'Error loading assignments.' });
    }
};

// ─── Notifications ────────────────────────────────────────────────────────────

/**
 * GET /notifications — full notification page
 */
exports.GetNotifications = async (req, res) => {
    try {
        if (!req.isLoggedIn) return res.redirect('/login');
        const user = res.locals.user;

        const notifications = await Notification.find({ recipient: user._id })
            .sort({ createdAt: -1 })
            .limit(50)
            .lean();

        // Mark all as read
        await Notification.updateMany({ recipient: user._id, isRead: false }, { isRead: true });

        return res.render('notifications', { user, notifications, unreadNotifCount: 0 });

    } catch (err) {
        console.error('GetNotifications error:', err);
        res.status(500).render('errors', { message: 'Error loading notifications.' });
    }
};

/**
 * POST /notifications/mark-read — AJAX mark a single notif as read
 */
exports.MarkNotifRead = async (req, res) => {
    try {
        await Notification.findByIdAndUpdate(req.params.id, { isRead: true });
        return res.json({ success: true });
    } catch (err) {
        return res.status(500).json({ success: false });
    }
};

// ─── Profile ──────────────────────────────────────────────────────────────────

exports.GetProfile = async (req, res) => {
    try {
        if (!req.isLoggedIn) return res.redirect('/login');
        const user = res.locals.user;

        // If viewing someone else's profile
        const targetId = req.params.id || req.userId;
     const profile = await Users.findById(targetId).lean();

if (!profile) {
    return res.status(404).render('errors', {
        message: 'User not found.'
    });
}

profile.skills = profile.skills || [];

        const profileAssignments = profile.role === 'writer'
            ? await Submission.countDocuments({ writer: profile._id, status: 'approved' })
            : await Assignment.countDocuments({ student: profile._id, status: 'completed' });

        return res.render('profile', {
            user,
            profile,
            completedCount: profileAssignments,
            unreadNotifCount: await Notification.countDocuments({ recipient: user._id, isRead: false }),
        });

    } catch (err) {
        console.error('GetProfile error:', err);
        res.status(500).render('errors', { message: 'Error loading profile.' });
    }
};

/**
 * POST /profile/update — update bio, skills, subjects, avatar
 */
exports.PostProfileUpdate = async (req, res) => {
    try {
        if (!req.isLoggedIn) return res.redirect('/login');

        const { bio, skills, subjects } = req.body;
        const updateData = {
            bio: bio?.trim() || '',
            skills: skills ? skills.split(',').map(s => s.trim()).filter(Boolean) : [],
        };

        if (subjects) {
            updateData.subjects = subjects.split(',').map(s => s.trim()).filter(Boolean);
        }

        if (req.file) {
            updateData.avatar = `/Uploads/profile/${req.file.filename}`;
        }

        await Users.findByIdAndUpdate(req.userId, updateData);

        return res.redirect('/profile');
    } catch (err) {
        console.error('PostProfileUpdate error:', err);
        return res.status(500).render('errors', { message: 'Error updating profile.' });
    }
};

// ─── Settings ─────────────────────────────────────────────────────────────────

exports.GetSettings = async (req, res) => {
    try {
        if (!req.isLoggedIn) return res.redirect('/login');
        const user = res.locals.user;
        return res.render('settings', {
            user,
            unreadNotifCount: await Notification.countDocuments({ recipient: user._id, isRead: false }),
            success: req.query.success || null,
            error: req.query.error || null,
        });
    } catch (err) {
        res.status(500).render('errors', { message: 'Error loading settings.' });
    }
};