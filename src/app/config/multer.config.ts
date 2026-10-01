import { CloudinaryStorage } from "multer-storage-cloudinary";
import { cloudinaryUpload } from "./cloudinary.config";
import multer from "multer";
import { StatusCodes } from "http-status-codes";
import AppError from "../errorHelpers/AppError";

// only photos and PDF reports, at most 5 MB each (checked before anything reaches Cloudinary)
export const UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "pdf"]);

const storage = new CloudinaryStorage({
    cloudinary: cloudinaryUpload,
    params: async (req, file) => {
        const originalName = file.originalname;
        const extension = originalName.split('.').pop()?.toLocaleLowerCase();
        const fileNameWithoutExtension = originalName.split('.').slice(0, -1).join('.').toLocaleLowerCase().replace(/[^a-z0-9_-]/g, "_").slice(0, 60);
        const uniqueName = Math.random().toString(36).substring(2) + Date.now() + "-" + fileNameWithoutExtension;
        const folder = extension === "pdf" ? "pdfs" : "images"

        return {
            folder: `ph-healthcare/${folder}`,
            public_id: uniqueName,
            resource_type: "auto",
        };
    }
})
export const multerUpload = multer({
    storage,
    limits: { fileSize: UPLOAD_MAX_BYTES, files: 6, fields: 10 },
    fileFilter: (req, file, cb) => {
        const extension = file.originalname.split(".").pop()?.toLowerCase() ?? "";
        if (ALLOWED_MIME_TYPES.has(file.mimetype) && ALLOWED_EXTENSIONS.has(extension)) {
            return cb(null, true);
        }
        cb(new AppError(StatusCodes.BAD_REQUEST, "Only JPG, PNG, WEBP images and PDF files are allowed"));
    },
})
