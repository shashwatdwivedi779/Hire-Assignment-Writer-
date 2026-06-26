const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'AssignTrust_JWT_Secret_2025!';

/**
 * Authentication Middleware
 * Reads the JWT from cookies, verifies it, and attaches userId + role to req.
 * Sets req.isLoggedIn = true/false.
 */
module.exports = (req, res, next) => {
    const token = req.cookies.token;

    // No token — treat as guest
    if (!token) {
        req.isLoggedIn = false;
        req.userId = null;
        req.userRole = null;
        return next();
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.userId   = decoded.userId;
        req.userRole = decoded.role;
        req.isLoggedIn = true;
    } catch (err) {
        // Token expired or tampered — clear the cookie
        res.clearCookie('token');
        req.isLoggedIn = false;
        req.userId   = null;
        req.userRole = null;
    }

    next();
};