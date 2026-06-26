/**
 * Role-Based Authorization Middleware
 * Usage: requireAuth(['client', 'admin'])
 * Place AFTER the authentication middleware in routes.
 */
exports.requireAuth = (roles = []) => {
    return (req, res, next) => {
        if (!req.isLoggedIn) {
            // If JSON request, send 401
            if (req.xhr || req.headers.accept?.includes('application/json')) {
                return res.status(401).json({ success: false, message: 'Please login to continue.' });
            }
            return res.redirect('/login');
        }

        if (roles.length > 0 && !roles.includes(req.userRole)) {
            if (req.xhr || req.headers.accept?.includes('application/json')) {
                return res.status(403).json({ success: false, message: 'Access denied.' });
            }
            return res.status(403).render('errors', {
                message: 'You do not have permission to access this page.'
            });
        }

        next();
    };
};

/**
 * Guest-only middleware — redirect logged-in users away from login/signup
 */
exports.guestOnly = (req, res, next) => {
    if (req.isLoggedIn) {
        return res.redirect('/dashboard');
    }
    next();
};
