const multer = require("multer");

// Memory Storage
const storage = multer.memoryStorage();

// Document Filter
const documentFilter = (req, file, cb) => {
    const allowed = [
        "image/jpeg",
        "image/png",
        "image/jpg",
        "image/gif",
        "image/webp",

        "application/pdf",

        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",

        "application/vnd.ms-powerpoint",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",

        "application/zip",
    ];

    if (allowed.includes(file.mimetype)) {
        return cb(null, true);
    }

    return cb(
        new Error(
            "Invalid file type. Allowed: Images, PDF, Word, PPT, ZIP."
        ),
        false
    );
};

// Image Filter
const imageFilter = (req, file, cb) => {
    const allowed = [
        "image/jpeg",
        "image/png",
        "image/jpg",
        "image/gif",
        "image/webp",
    ];

    if (allowed.includes(file.mimetype)) {
        return cb(null, true);
    }

    return cb(new Error("Only image files are allowed."), false);
};

// Assignment Upload
const assignmentUpload = multer({
    storage,
    fileFilter: documentFilter,
    limits: {
        fileSize: 15 * 1024 * 1024, // 15 MB
    },
});

// Submission Upload
const submissionUpload = multer({
    storage,
    fileFilter: documentFilter,
    limits: {
        fileSize: 20 * 1024 * 1024, // 20 MB
    },
});

// Profile Upload
const profileUpload = multer({
    storage,
    fileFilter: imageFilter,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5 MB
    },
});

// Chat Upload
const chatUpload = multer({
    storage,
    fileFilter: documentFilter,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10 MB
    },
});

// Assignment Fields
const assignmentUploadFields = assignmentUpload.fields([
    { name: "questionFiles", maxCount: 5 },
    { name: "referenceFiles", maxCount: 10 },
]);

// Submission Fields
const submissionUploadFields = submissionUpload.fields([
    { name: "submissionFiles", maxCount: 10 },
]);

// Profile
const profileUploadSingle = profileUpload.single("avatar");

// Chat
const chatUploadSingle = chatUpload.single("chatFile");

module.exports = {
    assignmentUploadFields,
    submissionUploadFields,
    profileUploadSingle,
    chatUploadSingle,
};