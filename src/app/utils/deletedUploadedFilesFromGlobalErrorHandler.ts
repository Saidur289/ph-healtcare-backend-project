import { Request } from "express";
import { deleteFileFromCloudinary } from "../config/cloudinary.config";

// When a request fails, remove the files multer already uploaded to Cloudinary.
// Never throws: a cleanup problem must not hide the real error or crash the server.
export const deleteUploadedFilesFromGlobalErrorHandler = async (
  req: Request,
) => {
  const filesToDelete: string[] = [];
  if (req.file?.path) {
    filesToDelete.push(req.file.path);
  }
  if (Array.isArray(req.files)) {
    // upload.array()
    req.files.forEach((file) => file.path && filesToDelete.push(file.path));
  } else if (req.files && typeof req.files === "object") {
    // upload.fields()
    Object.values(req.files).forEach((fileArray) => {
      fileArray.forEach((file) => file.path && filesToDelete.push(file.path));
    });
  }
  if (filesToDelete.length === 0) return;

  const results = await Promise.allSettled(
    filesToDelete.map((file) => deleteFileFromCloudinary(file)),
  );
  results.forEach((result) => {
    if (result.status === "rejected") {
      console.error("Failed to delete uploaded file:", result.reason);
    }
  });
};
