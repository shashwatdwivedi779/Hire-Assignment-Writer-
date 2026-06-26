const express = require('express');
const router  = express.Router();

const AuthController   = require('../controller/signup');
const DashController   = require('../controller/dashbord');
const SellerController = require('../controller/seller');
const WriterController = require('../controller/writer');
const ChatController   = require('../controller/chat');
const AdminController  = require('../controller/admin');

const { requireAuth, guestOnly } = require('../middleware/authorize');
const {
    assignmentUploadFields,
    submissionUploadFields,
    profileUploadSingle,
    chatUploadSingle,
} = require('../middleware/multer');

// ─── Public Routes ────────────────────────────────────────────────────────────
router.get('/', (req, res) => res.render('home'));

// ─── Auth Routes ──────────────────────────────────────────────────────────────
router.get('/signup',  guestOnly, AuthController.GetSignup);
router.post('/otp',              AuthController.PostOTP);
router.post('/verifyotp',        AuthController.VrityOTP);
router.post('/signup',           AuthController.PostSignup);
router.get('/login',   guestOnly, AuthController.GetLogin);
router.post('/login',            AuthController.PostLogin);
router.get('/logout',            AuthController.Logout);

// Forgot / Reset Password
router.post('/forgot-password',           AuthController.PostForgotPassword);
router.get('/reset-password/:token',      AuthController.GetResetPassword);
router.post('/reset-password/:token',     AuthController.PostResetPassword);

// ─── Dashboard ────────────────────────────────────────────────────────────────
router.get('/dashboard', requireAuth(), DashController.GetDashboard);

// ─── Marketplace (Writers browse open assignments) ────────────────────────────
router.get('/marketplace', requireAuth(['writer', 'client', 'admin']), DashController.GetMarketplace);

// ─── Assignment Routes ────────────────────────────────────────────────────────
router.get('/create',             requireAuth(['client']),        SellerController.GetCreate);
router.post('/create',            requireAuth(['client']),        assignmentUploadFields, SellerController.PostCreate);
router.get('/my-assignments',     requireAuth(['client']),        DashController.GetMyAssignments);
router.get('/assignment/:id',     requireAuth(),                  DashController.GetAssignmentDetail);
router.get('/assignment/:id/edit',requireAuth(['client']),        SellerController.GetEdit);
router.post('/assignment/:id/edit',requireAuth(['client']),       SellerController.PostEdit);
router.delete('/assignment/:id',  requireAuth(['client']),        SellerController.DeleteAssignment);
router.post('/assignment/:id/close', requireAuth(['client']),     SellerController.CloseAssignment);
router.post('/assignment/:id/complete', requireAuth(['client']),  SellerController.MarkCompleted);

// Proposals (Client view)
router.get('/assignment/:id/proposals', requireAuth(['client']), SellerController.GetProposals);
router.post('/proposal/:proposalId/accept', requireAuth(['client']), SellerController.AcceptProposal);
router.post('/proposal/:proposalId/reject', requireAuth(['client']), SellerController.RejectProposal);

// ─── Writer Routes ────────────────────────────────────────────────────────────
router.post('/proposal',            requireAuth(['writer']), WriterController.PostProposal);
router.put('/proposal/:id',         requireAuth(['writer']), WriterController.PutProposal);
router.post('/proposal/:id/withdraw', requireAuth(['writer']), WriterController.WithdrawProposal);
router.get('/my-proposals',          requireAuth(['writer']), WriterController.GetMyProposals);
router.get('/my-work',               requireAuth(['writer']), WriterController.GetActiveWork);
router.post('/submit',               requireAuth(['writer']), submissionUploadFields, WriterController.PostSubmission);

// ─── Chat Routes ──────────────────────────────────────────────────────────────
router.get('/chat',             requireAuth(), ChatController.GetInbox);
router.get('/chat/:id',         requireAuth(), ChatController.GetConversation);
router.post('/chat/start',      requireAuth(), ChatController.StartConversation);
router.post('/chat/:id/send',   requireAuth(), chatUploadSingle, ChatController.SendMessage);
router.delete('/chat/message/:msgId', requireAuth(), ChatController.DeleteMessage);

// ─── Profile Routes ────────────────────────────────────────────────────────────
router.get('/profile',       requireAuth(), DashController.GetProfile);
router.get('/profile/:id',   requireAuth(), DashController.GetProfile);
router.post('/profile/update', requireAuth(), profileUploadSingle, DashController.PostProfileUpdate);

// ─── Notifications ────────────────────────────────────────────────────────────
router.get('/notifications',          requireAuth(), DashController.GetNotifications);
router.post('/notifications/:id/read', requireAuth(), DashController.MarkNotifRead);

// ─── Settings ─────────────────────────────────────────────────────────────────
router.get('/settings',                  requireAuth(), DashController.GetSettings);
router.post('/settings/change-password', requireAuth(), AuthController.PostChangePassword);

// ─── Admin Routes ─────────────────────────────────────────────────────────────
router.get('/admin',              requireAuth(['admin']), AdminController.GetAdminDashboard);
router.get('/admin/users',        requireAuth(['admin']), AdminController.GetUsers);
router.delete('/admin/users/:id', requireAuth(['admin']), AdminController.DeleteUser);
router.get('/admin/assignments',  requireAuth(['admin']), AdminController.GetAssignments);
router.delete('/admin/assignments/:id', requireAuth(['admin']), AdminController.AdminDeleteAssignment);
router.get('/admin/proposals',    requireAuth(['admin']), AdminController.GetProposals);

// ─── Errors ───────────────────────────────────────────────────────────────────
router.use((req, res) => {
    res.status(404).render('errors', { message: 'Page not found.' });
});

module.exports = router;
