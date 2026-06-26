const Conversation = require('../model/conversation');
const Message = require('../model/message');
const Users = require('../model/users');
const Notification = require('../model/notification');
const { createNotification } = require('../utils/notify');

const getIo = (req) => req.app.get('io');

// ─── GET /chat — Inbox (list all conversations) ───────────────────────────────

exports.GetInbox = async (req, res) => {
    try {
        if (!req.isLoggedIn) return res.redirect('/login');
        const user = res.locals.user;

        const conversations = await Conversation.find({ participants: req.userId })
            .populate('participants', 'name avatar isOnline')
            .sort({ lastMessageAt: -1 })
            .lean();

        // Format for display — find the "other" participant
        const formatted = conversations.map(conv => {
            const other = conv.participants.find(p => p._id.toString() !== req.userId.toString());
            return {
                ...conv,
                other,
                unread: (conv.unreadCount && conv.unreadCount[req.userId.toString()]) || 0,
            };
        });

        return res.render('chat/inbox', {
            user,
            conversations: formatted,
            unreadNotifCount: await Notification.countDocuments({ recipient: user._id, isRead: false }),
        });

    } catch (err) {
        console.error('GetInbox error:', err);
        res.status(500).render('errors', { message: 'Error loading inbox.' });
    }
};

// ─── GET /chat/:conversationId — View Messages ─────────────────────────────────

exports.GetConversation = async (req, res) => {
    try {
        if (!req.isLoggedIn) return res.redirect('/login');
        const user = res.locals.user;

        const conversation = await Conversation.findOne({
            _id: req.params.id,
            participants: req.userId,
        }).populate('participants', 'name avatar isOnline college role');

        if (!conversation) return res.status(404).render('errors', { message: 'Conversation not found.' });

        const messages = await Message.find({ conversation: conversation._id, isDeleted: false })
            .populate('sender', 'name avatar')
            .sort({ createdAt: 1 })
            .lean();

        // Mark messages as read by this user
        await Message.updateMany(
            { conversation: conversation._id, readBy: { $ne: req.userId } },
            { $addToSet: { readBy: req.userId } }
        );

        // Reset unread count
        await Conversation.findByIdAndUpdate(conversation._id, {
            [`unreadCount.${req.userId}`]: 0,
        });

        const other = conversation.participants.find(p => p._id.toString() !== req.userId.toString());

        return res.render('chat/conversation', {
            user,
            conversation,
            messages,
            other,
            unreadNotifCount: await Notification.countDocuments({ recipient: user._id, isRead: false }),
        });

    } catch (err) {
        console.error('GetConversation error:', err);
        res.status(500).render('errors', { message: 'Error loading conversation.' });
    }
};

// ─── POST /chat/start — Start or retrieve a conversation ──────────────────────

exports.StartConversation = async (req, res) => {
    try {
        if (!req.isLoggedIn) return res.redirect('/login');

        const { recipientId, assignmentId } = req.body;

        if (recipientId === req.userId.toString()) {
            return res.status(400).json({ success: false, message: 'Cannot chat with yourself.' });
        }

        // Find existing conversation between the two users
        let conversation = await Conversation.findOne({
            participants: { $all: [req.userId, recipientId] },
        });

        if (!conversation) {
            conversation = await Conversation.create({
                participants: [req.userId, recipientId],
                assignment: assignmentId || null,
            });
        }

        return res.json({ success: true, conversationId: conversation._id });

    } catch (err) {
        console.error('StartConversation error:', err);
        return res.status(500).json({ success: false, message: 'Error starting conversation.' });
    }
};

// ─── POST /chat/:conversationId/send — Send message (REST fallback) ───────────

exports.SendMessage = async (req, res) => {
    try {
        if (!req.isLoggedIn) return res.status(401).json({ success: false });
        const io = getIo(req);

        const { text } = req.body;
        const conversation = await Conversation.findOne({
            _id: req.params.id,
            participants: req.userId,
        });

        if (!conversation) return res.status(404).json({ success: false, message: 'Conversation not found.' });

        let msgType = 'text';
        let fileData = null;

        if (req.file) {
            const mime = req.file.mimetype;
            if (mime.startsWith('image/')) msgType = 'image';
            else if (mime === 'application/pdf') msgType = 'pdf';
            else msgType = 'file';

            fileData = {
                url: `/Uploads/chat/${req.file.filename}`,
                originalName: req.file.originalname,
                mimetype: req.file.mimetype,
            };
        }

        const message = await Message.create({
            conversation: conversation._id,
            sender: req.userId,
            text: text || '',
            file: fileData,
            type: msgType,
            readBy: [req.userId],
        });

        // Find recipient
        const recipientId = conversation.participants.find(p => p.toString() !== req.userId.toString());

        // Update conversation last message
        await Conversation.findByIdAndUpdate(conversation._id, {
            lastMessage: text || (fileData ? fileData.originalName : ''),
            lastMessageAt: new Date(),
            $inc: { [`unreadCount.${recipientId}`]: 1 },
        });

        // Populate sender info for socket emit
        const populatedMsg = await Message.findById(message._id)
            .populate('sender', 'name avatar')
            .lean();

        // Emit to conversation room
        io?.to(`conv_${conversation._id}`).emit('new_message', populatedMsg);

        // Notify recipient
        const sender = res.locals.user;
        await createNotification(io, {
            recipient: recipientId,
            sender: req.userId,
            type: 'new_message',
            message: `${sender.name}: ${text?.substring(0, 60) || 'Sent a file'}`,
            link: `/chat/${conversation._id}`,
        });

        return res.json({ success: true, message: populatedMsg });

    } catch (err) {
        console.error('SendMessage error:', err);
        return res.status(500).json({ success: false, message: 'Error sending message.' });
    }
};

// ─── DELETE /chat/message/:msgId — Soft delete message ────────────────────────

exports.DeleteMessage = async (req, res) => {
    try {
        const message = await Message.findOne({ _id: req.params.msgId, sender: req.userId });
        if (!message) return res.status(404).json({ success: false, message: 'Message not found.' });

        message.isDeleted = true;
        message.text = '';
        await message.save();

        const io = getIo(req);
        io?.to(`conv_${message.conversation}`).emit('message_deleted', { messageId: message._id });

        return res.json({ success: true });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Error deleting message.' });
    }
};
