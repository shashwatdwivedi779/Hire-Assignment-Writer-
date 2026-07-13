const { PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl: getAwsSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { randomUUID } = require("crypto");
const path = require("path");

const s3 = require("../config/s3");

const uploadFile = async (file, folder) => {
    if (!file || !file.originalname || !file.buffer) {
        throw new Error("Invalid file object");
    }

    const extension = path.extname(file.originalname);
    const fileName = `${folder}/${randomUUID()}${extension}`;

    await s3.send(
        new PutObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: fileName,
            Body: file.buffer,
            ContentType: file.mimetype,
        })
    );

    return {
        key: fileName,
        originalName: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
    };
};

const deleteFile = async (key) => {
    if (!key) return;

    try {
        await s3.send(
            new DeleteObjectCommand({
                Bucket: process.env.AWS_BUCKET_NAME,
                Key: key,
            })
        );
    } catch (error) {
        console.error(`Error deleting file from S3: ${key}`, error);
    }
};

const getSignedUrl = async (key, expiresIn = 600) => {
    if (!key) return null;

    try {
        const command = new GetObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: key,
        });

        // Expires in 10 minutes (600 seconds) by default
        return await getAwsSignedUrl(s3, command, { expiresIn });
    } catch (error) {
        console.error(`Error generating signed URL for key: ${key}`, error);
        return null;
    }
};

module.exports = {
    uploadFile,
    deleteFile,
    getSignedUrl,
};
