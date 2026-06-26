const Notification = require('../model/notification');

/**
 * Create and emit a notification.
 * @param {object} io     - Socket.IO server instance
 * @param {object} data   - { recipient, sender, type, message, link }
 */
const createNotification = async (io, data) => {
    try {
        const notif = await Notification.create({
            recipient: data.recipient,
            sender:    data.sender || null,
            type:      data.type,
            message:   data.message,
            link:      data.link || '/dashboard',
        });

        // Emit real-time notification via Socket.IO if connected
        if (io) {
            io.to(data.recipient.toString()).emit('notification', {
                _id:       notif._id,
                type:      notif.type,
                message:   notif.message,
                link:      notif.link,
                isRead:    false,
                createdAt: notif.createdAt,
            });
        }

        return notif;
    } catch (err) {
        console.error('createNotification error:', err.message);
    }
};

module.exports = { createNotification };
