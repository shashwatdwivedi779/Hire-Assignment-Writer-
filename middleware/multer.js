const path = require('path');
const multer = require('multer');
const fs = require('fs');

// Helper: ensure directory exists
const ensureDir = (dirPath) => {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
};

// Base uploads directory
const BASE_UPLOAD = path.join(__dirname, '..', 'Uploads');

// Create sub-directories
['profile', 'assignments', 'submissions', 'chat'].forEach(d =>
    ensureDir(path.join(BASE_UPLOAD, d))
);

/**
 * Build a multer storage engine for a specific sub-folder.
 */
const buildStorage = (subFolder) =>
    multer.diskStorage({
        destination: (req, file, cb) => {
            cb(null, path.join(BASE_UPLOAD, subFolder));
        },
        filename: (req, file, cb) => {
            const ext = path.extname(file.originalname);
            cb(null, `AssignTrust-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
        },
    });

// Allowed file types
const documentFilter = (req, file, cb) => {
    const allowed = [
        'image/jpeg', 'image/png', 'image/jpg', 'image/gif', 'image/webp',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/zip',
    ];
    if (allowed.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Allowed: Images, PDF, Word, PPT, ZIP.'), false);
    }
};

const imageFilter = (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/jpg', 'image/gif', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Only image files are allowed.'), false);
    }
};

// ─── Multer instances ────────────────────────────────────────────────────────

/** For assignment question + reference files */
const assignmentUpload = multer({
    storage: buildStorage('assignments'),
    fileFilter: documentFilter,
    limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB
});

/** For submission files */
const submissionUpload = multer({
    storage: buildStorage('submissions'),
    fileFilter: documentFilter,
    limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
});

/** For profile avatar */
const profileUpload = multer({
    storage: buildStorage('profile'),
    fileFilter: imageFilter,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

/** For chat file/image attachments */
const chatUpload = multer({
    storage: buildStorage('chat'),
    fileFilter: documentFilter,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

// ─── Named field configurations ──────────────────────────────────────────────

const assignmentUploadFields = assignmentUpload.fields([
    { name: 'questionFiles', maxCount: 5 },
    { name: 'referenceFiles', maxCount: 10 },
]);

const submissionUploadFields = submissionUpload.fields([
    { name: 'submissionFiles', maxCount: 10 },
]);

const profileUploadSingle = profileUpload.single('avatar');

const chatUploadSingle = chatUpload.single('chatFile');

module.exports = {
    assignmentUploadFields,
    submissionUploadFields,
    profileUploadSingle,
    chatUploadSingle,
};