import { randomUUID } from "crypto";
import { NextFunction, Request, RequestHandler, Response } from "express";
import { StatusCodes } from "http-status-codes";
import multer from "multer";
import AppError from "../errorHelpers/AppError";
import { cloudinaryUpload, deleteFileFromCloudinary } from "./cloudinary.config";

// Uploads: photos and PDF reports only, at most 5 MB each and 5 files per request.
// Files are held in memory first so their real content (magic bytes) can be checked
// before anything is stored; the stored name is random (never the user's file name).
export const UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
export const UPLOAD_MAX_FILES = 5;

type TKind = { mime: string; ext: string; matches: (b: Buffer) => boolean };
const KINDS: TKind[] = [
  { mime: "image/jpeg", ext: "jpg", matches: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/png", ext: "png", matches: (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: "image/webp", ext: "webp", matches: (b) => b.length > 12 && b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP" },
  { mime: "application/pdf", ext: "pdf", matches: (b) => b.length > 5 && b.subarray(0, 5).toString("ascii") === "%PDF-" },
];
const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "pdf"]);
const NOT_ALLOWED = "Only JPG, PNG, WEBP images and PDF files are allowed";

const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: UPLOAD_MAX_BYTES, files: UPLOAD_MAX_FILES, fields: 10, fieldSize: 100 * 1024 },
  // first, cheap check on the declared type and extension
  fileFilter: (req, file, cb) => {
    const extension = file.originalname.split(".").pop()?.toLowerCase() ?? "";
    if (KINDS.some((k) => k.mime === file.mimetype) && ALLOWED_EXTENSIONS.has(extension)) return cb(null, true);
    cb(new AppError(StatusCodes.BAD_REQUEST, NOT_ALLOWED));
  },
});

const uploadBuffer = (buffer: Buffer, kind: TKind) =>
  new Promise<string>((resolve, reject) => {
    cloudinaryUpload.uploader
      .upload_stream(
        {
          folder: `ph-healthcare/${kind.ext === "pdf" ? "pdfs" : "images"}`,
          public_id: randomUUID(),
          // same as before: Cloudinary stores PDFs as "image" resources too (keeps old links and deletes working)
          resource_type: "image",
          format: kind.ext,
        },
        (error, result) => (error || !result ? reject(error ?? new Error("Upload failed")) : resolve(result.secure_url)),
      )
      .end(buffer);
  });

const filesOf = (req: Request): Express.Multer.File[] => {
  if (req.file) return [req.file];
  if (Array.isArray(req.files)) return req.files;
  if (req.files) return Object.values(req.files).flat();
  return [];
};

// second check on the content, then store. Sets file.path to the stored URL (as before),
// so controllers and the error-handler cleanup keep working unchanged.
const storeUploads = async (req: Request, _res: Response, next: NextFunction) => {
  const files = filesOf(req);
  const stored: string[] = [];
  try {
    for (const file of files) {
      const kind = KINDS.find((k) => k.mime === file.mimetype);
      if (!kind || !kind.matches(file.buffer)) {
        throw new AppError(StatusCodes.BAD_REQUEST, `${NOT_ALLOWED} (the content of "${file.fieldname}" does not match its type)`);
      }
      file.path = await uploadBuffer(file.buffer, kind);
      stored.push(file.path);
      file.buffer = Buffer.alloc(0); // free memory early
    }
    next();
  } catch (error) {
    await Promise.allSettled(stored.map((url) => deleteFileFromCloudinary(url)));
    files.forEach((file) => (file.path = ""));
    next(error instanceof AppError ? error : new AppError(StatusCodes.BAD_GATEWAY, "The file could not be stored. Please try again."));
  }
};

const withStore = (handler: RequestHandler): RequestHandler[] => [handler, storeUploads];

export const multerUpload = {
  single: (field: string) => withStore(memoryUpload.single(field)),
  fields: (fields: multer.Field[]) => withStore(memoryUpload.fields(fields)),
  array: (field: string, maxCount = UPLOAD_MAX_FILES) => withStore(memoryUpload.array(field, maxCount)),
};
