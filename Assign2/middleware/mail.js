// config/mail.js

const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({

    service: "gmail",

    auth: {
        user: process.env.MAIL_USER || 'reelai550@gmail.com',
        pass: process.env.MAIL_PASS || 'nobc sxwx wpgu quiw'
    }

});

module.exports = transporter;