require('dotenv').config();
const express = require('express');
const path = require('path');
const http = require('http');
const mongoose = require('mongoose');
const CookieParser = require('cookie-parser');
const session = require('express-session');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

const UTILS = require('../utils/path');
const auth = require('../middleware/authentication');
const Users = require('../model/users');
const router = require('../routes/router');

const JWT_SECRET = process.env.JWT_SECRET || 'AssignTrust_JWT_Secret_2025!';
const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017/SecondDB';
const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
});


app.set('io', io);


app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(CookieParser());

app.use(session({
    secret: process.env.SESSION_SECRET || 'AssignTrust_session_secret_2025',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 30 * 60 * 1000, secure: false }, // 30 min session
}));


app.use(express.static(path.join(UTILS, 'Public')));


app.use('/Uploads', express.static(path.join(UTILS, 'Uploads')));

// ─── View Engine ──────────────────────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

// ─── Auth Middleware (sets req.isLoggedIn, req.userId, req.userRole) ──────────
app.use(auth);

// ─── Locals: isLoggedIn & user ────────────────────────────────────────────────
app.use(async (req, res, next) => {
    res.locals.isLoggedIn = req.isLoggedIn;
    // Skip DB lookups for static assets
    if (req.path.startsWith('/Uploads') || req.path.match(/\.(css|js|jpg|png|ico|woff2?)$/)) {
        res.locals.user = null;
        return next();
    }

    try {
        if (req.userId && mongoose.Types.ObjectId.isValid(req.userId)) {
            const user = await Users.findById(req.userId).lean();
            res.locals.user = user || null;
        } else {
            res.locals.user = null;
        }
    } catch {
        res.locals.user = null;
    }
    next();
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use(router);

// ─── Socket.IO Setup ──────────────────────────────────────────────────────────
io.use((socket, next) => {
    // Authenticate socket connection via JWT cookie or handshake auth
    let token = socket.handshake.auth?.token;

    if (!token) {
        // Parse cookie header properly (handles URL-encoded = in JWT base64)
        const cookieHeader = socket.handshake.headers?.cookie || '';
        const tokenCookie = cookieHeader.split('; ').find(c => c.startsWith('token='));
        if (tokenCookie) {
            // Everything after the first '=' is the token value (JWT may contain '=' padding)
            const rawToken = tokenCookie.substring(6); // 'token='.length === 6
            try {
                token = decodeURIComponent(rawToken);
            } catch {
                token = rawToken;
            }
        }
    }

    if (!token) return next(new Error('Unauthorized'));

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        socket.userId = decoded.userId;
        socket.userRole = decoded.role;
        next();
    } catch {
        next(new Error('Invalid token'));
    }
});

io.on('connection', async (socket) => {
    const userId = socket.userId;

    // Join personal room for notifications
    socket.join(userId);

    // Update online status
    try {
        await Users.findByIdAndUpdate(userId, { isOnline: true, lastSeen: new Date() });
        io.emit('user_online', { userId });
    } catch { }

    // ─── Join conversation room ───────────────────────────────────────────────
    socket.on('join_conversation', (conversationId) => {
        socket.join(`conv_${conversationId}`);
    });

    socket.on('leave_conversation', (conversationId) => {
        socket.leave(`conv_${conversationId}`);
    });

    // ─── Real-time message send (for instant delivery without page reload) ────
    socket.on('send_message', async (data) => {
        // data: { conversationId, text }
        // The actual DB save is done via POST /chat/:id/send
        // This is just for instant typing indicator + broadcast
        socket.to(`conv_${data.conversationId}`).emit('new_message', {
            ...data,
            senderId: userId,
            createdAt: new Date(),
        });
    });

    // ─── Typing indicator ─────────────────────────────────────────────────────
    socket.on('typing', (data) => {
        socket.to(`conv_${data.conversationId}`).emit('typing', {
            userId,
            conversationId: data.conversationId,
        });
    });

    socket.on('stop_typing', (data) => {
        socket.to(`conv_${data.conversationId}`).emit('stop_typing', {
            userId,
            conversationId: data.conversationId,
        });
    });

    // ─── Disconnect ───────────────────────────────────────────────────────────
    socket.on('disconnect', async () => {
        try {
            await Users.findByIdAndUpdate(userId, { isOnline: false, lastSeen: new Date() });
            io.emit('user_offline', { userId });
        } catch { }

    });
});

// ─── MongoDB + Server Start ───────────────────────────────────────────────────
mongoose.connect(MONGO_URL)
    .then(() => {
        server.listen(PORT, '0.0.0.0', () => {
            console.log(`✅ AssignTrust running at http://localhost:${PORT}`);
        });
    })
    .catch(err => {
        console.error('❌ MongoDB connection error:', err.message);
    });