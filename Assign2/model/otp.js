const mongoose = require("mongoose");

const OtpSchema = new mongoose.Schema({

    email:{
        type:String,
        required:true
    },
    otp:{
        type:String,
        required:true
    },
    expiresAt:{
        type:Date,
        required:true,
        expires: 0 // Document will be automatically deleted when current time >= expiresAt
    }
});

module.exports = mongoose.model("Otp",OtpSchema);