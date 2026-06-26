const Otp = require('../model/otp');
const Users = require('../model/users');
const transporter = require('../middleware/mail');
const { check, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'AssignTrust_JWT_Secret_2025!';

// ─── GET /signup ──────────────────────────────────────────────────────────────

exports.GetSignup = (req, res) => {
    res.render('signup', {
        errors: [],
        OldInput: { name: '', email: '', gender: '', college: '', role: '' },
    });
};

// ─── POST /otp — Send OTP to email ───────────────────────────────────────────

exports.PostOTP = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ success: false, message: 'Email is required.' });

        // Check if email already registered
        const existing = await Users.findOne({ email: email.toLowerCase().trim() });
        if (existing) {
            return res.status(409).json({ success: false, message: 'Email already registered. Please login.' });
        }

        await Otp.deleteMany({ email });
        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        await Otp.create({
            email,
            otp,
            expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
        });

        await transporter.sendMail({
            from: '"AssignTrust" <reelai550@gmail.com>',
            to: email,
            subject: 'AssignTrust — Email Verification OTP',
            html: `
                <div style="font-family:Inter,sans-serif;max-width:480px;margin:auto;background:#0f172a;color:#f1f5f9;border-radius:16px;padding:32px;">
                    <h2 style="color:#6c63ff;margin-bottom:8px;">AssignTrust</h2>
                    <h3>Email Verification</h3>
                    <p>Your One-Time Password (OTP):</p>
                    <div style="font-size:36px;font-weight:800;letter-spacing:8px;color:#00d4ff;margin:20px 0;">${otp}</div>
                    <p style="color:#8892a4;">Valid for <strong>5 minutes</strong>. Do not share this code.</p>
                </div>
            `,
        });

        return res.json({ success: true, message: 'OTP sent to your email.' });

    } catch (err) {
        console.error('PostOTP error:', err);
        return res.status(500).json({ success: false, message: 'Failed to send OTP. Try again.' });
    }
};

// ─── POST /verifyotp ──────────────────────────────────────────────────────────

exports.VrityOTP = async (req, res) => {
    try {
        const { email, otp } = req.body;

        const otpRecord = await Otp.findOne({ email });
        if (!otpRecord) {
            return res.json({ success: false, message: 'OTP not found. Please request a new one.' });
        }
        if (otpRecord.expiresAt < Date.now()) {
            await Otp.deleteMany({ email });
            return res.json({ success: false, message: 'OTP expired. Please request a new one.' });
        }
        if (otpRecord.otp.toString() !== otp.toString()) {
            return res.json({ success: false, message: 'Invalid OTP. Please try again.' });
        }

        req.session.otpVerified = true;
        req.session.verifiedEmail = email;
        await Otp.deleteMany({ email });

        return res.json({ success: true, message: 'Email verified successfully.' });

    } catch (err) {
        console.error('VrityOTP error:', err);
        return res.status(500).json({ success: false, message: 'Verification error.' });
    }
};

// ─── POST /signup ─────────────────────────────────────────────────────────────

exports.PostSignup = [
    check('name').notEmpty().withMessage('Name is required').trim(),
    check('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
    check('gender').isIn(['male', 'female', 'others']).withMessage('Please select a valid gender'),
    check('role').isIn(['client', 'writer']).withMessage('Please select a valid role'),
    check('college').notEmpty().withMessage('Please select your college'),
    check('password')
        .isLength({ min: 5 }).withMessage('Password must be at least 5 characters')
        .matches(/[!@&#]/).withMessage('Password must contain at least one special character (!@&#)')
        .trim(),
    check('confirmPassword').custom((val, { req }) => {
        if (val !== req.body.password) throw new Error('Passwords do not match.');
        return true;
    }),

    async (req, res) => {
        const errors = validationResult(req);
        const { name, email, gender, college, role, password } = req.body;

        if (!errors.isEmpty()) {
            return res.status(400).render('signup', {
                errors: errors.array().map(e => e.msg),
                OldInput: { name, email, gender, college, role },
            });
        }

        try {
            const existingUser = await Users.findOne({ email });
            if (existingUser) {
                return res.status(409).render('signup', {
                    errors: ['This email is already registered.'],
                    OldInput: { name, email, gender, college, role },
                });
            }

            const hashedpass = await bcrypt.hash(password, 12);

            const user = await Users.create({
                name,
                email,
                gender,
                college,
                role,
                password: hashedpass,
                isVerified: true, // OTP already verified before this step
            });

            await Otp.deleteMany({ email });

            // Auto-login after signup
            const token = jwt.sign({ userId: user._id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
            res.cookie('token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });

            return res.redirect('/dashboard');

        } catch (err) {
            console.error('PostSignup error:', err);
            return res.status(500).render('signup', {
                errors: ['Something went wrong. Please try again.'],
                OldInput: { name, email, gender, college, role },
            });
        }
    },
];

// ─── GET /login ───────────────────────────────────────────────────────────────

exports.GetLogin = (req, res) => {
    res.render('login', { errors: [], OldInput: { email: '' } });
};

// ─── POST /login ──────────────────────────────────────────────────────────────

exports.PostLogin = async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await Users.findOne({ email: email?.toLowerCase().trim() });
        if (!user) {
            return res.status(401).render('login', {
                errors: ['No account found with this email.'],
                OldInput: { email },
            });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).render('login', {
                errors: ['Incorrect password. Please try again.'],
                OldInput: { email },
            });
        }

        const token = jwt.sign({ userId: user._id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
        res.cookie('token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });

        return res.redirect('/dashboard');

    } catch (err) {
        console.error('PostLogin error:', err);
        return res.status(500).render('login', {
            errors: ['Server error. Please try again.'],
            OldInput: { email: '' },
        });
    }
};

// ─── GET/POST /logout ─────────────────────────────────────────────────────────

exports.Logout = (req, res) => {
    res.clearCookie('token');
    req.session.destroy(() => {
        res.redirect('/login');
    });
};

// ─── POST /forgot-password ────────────────────────────────────────────────────

exports.PostForgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        const user = await Users.findOne({ email: email?.toLowerCase().trim() });

        // Always respond success to prevent user enumeration
        const successMsg = 'If this email exists, a reset link has been sent.';

        if (!user) return res.json({ success: true, message: successMsg });

        const token = crypto.randomBytes(32).toString('hex');
        user.resetPasswordToken = token;
        user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
        await user.save();

        const resetLink = `http://localhost:3000/reset-password/${token}`;

        await transporter.sendMail({
            from: '"AssignTrust" <reelai550@gmail.com>',
            to: user.email,
            subject: 'AssignTrust — Password Reset',
            html: `
                <div style="font-family:Inter,sans-serif;max-width:480px;margin:auto;background:#0f172a;color:#f1f5f9;border-radius:16px;padding:32px;">
                    <h2 style="color:#6c63ff;">AssignTrust</h2>
                    <h3>Password Reset Request</h3>
                    <p>Click the button below to reset your password. This link expires in 1 hour.</p>
                    <a href="${resetLink}" style="display:inline-block;margin:20px 0;padding:14px 28px;background:linear-gradient(135deg,#6c63ff,#00d4ff);color:#fff;border-radius:10px;text-decoration:none;font-weight:700;">Reset Password</a>
                    <p style="color:#8892a4;">If you did not request this, ignore this email.</p>
                </div>
            `,
        });

        return res.json({ success: true, message: successMsg });

    } catch (err) {
        console.error('PostForgotPassword error:', err);
        return res.status(500).json({ success: false, message: 'Server error.' });
    }
};

// ─── GET /reset-password/:token ────────────────────────────────────────────────

exports.GetResetPassword = async (req, res) => {
    try {
        const user = await Users.findOne({
            resetPasswordToken: req.params.token,
            resetPasswordExpires: { $gt: Date.now() },
        });

        if (!user) {
            return res.render('auth/resetPassword', { valid: false, token: null });
        }

        return res.render('auth/resetPassword', { valid: true, token: req.params.token });

    } catch (err) {
        res.status(500).render('errors', { message: 'Error loading reset page.' });
    }
};

// ─── POST /reset-password/:token ───────────────────────────────────────────────

exports.PostResetPassword = async (req, res) => {
    try {
        const { password, confirmPassword } = req.body;

        if (password !== confirmPassword) {
            return res.json({ success: false, message: 'Passwords do not match.' });
        }
        if (password.length < 5) {
            return res.json({ success: false, message: 'Password must be at least 5 characters.' });
        }

        const user = await Users.findOne({
            resetPasswordToken: req.params.token,
            resetPasswordExpires: { $gt: Date.now() },
        });

        if (!user) {
            return res.json({ success: false, message: 'Reset link is invalid or expired.' });
        }

        user.password = await bcrypt.hash(password, 12);
        user.resetPasswordToken = null;
        user.resetPasswordExpires = null;
        await user.save();

        return res.json({ success: true, message: 'Password reset successfully. You can now login.' });

    } catch (err) {
        console.error('PostResetPassword error:', err);
        return res.status(500).json({ success: false, message: 'Server error.' });
    }
};

// ─── POST /settings/change-password ───────────────────────────────────────────

exports.PostChangePassword = async (req, res) => {
    try {
        if (!req.isLoggedIn) return res.redirect('/login');
        const { currentPassword, newPassword, confirmNewPassword } = req.body;

        if (newPassword !== confirmNewPassword) {
            return res.redirect('/settings?error=Passwords+do+not+match');
        }

        const user = await Users.findById(req.userId);
        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.redirect('/settings?error=Current+password+is+incorrect');
        }

        user.password = await bcrypt.hash(newPassword, 12);
        await user.save();

        // Clear token to force re-login
        res.clearCookie('token');
        return res.redirect('/login');

    } catch (err) {
        return res.redirect('/settings?error=Server+error');
    }
};