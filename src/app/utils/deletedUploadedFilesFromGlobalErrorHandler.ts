import { Request } from "express";
import { deleteFileFromCloudinary } from "../config/cloudinary.config";

export const deleteUploadedFilesFromGlobalErrorHandler = (req: Request) => {
  const filesToDelete: string[] = [];
  if (req.file && req.file.path) {
    filesToDelete.push(req.file.path);
  } else if (typeof req.files === "object" && !Array.isArray(req.files)) {
    Object.values(req.files).forEach((fileArray) => {
      fileArray.forEach((file) => {
        if (req.file) {
          filesToDelete.push(file.path);
        }
      });
    });
  } else if (Array.isArray(req.files) && req.files.length > 0) {
    req.files.forEach((file) => {
      if (req.file) {
        filesToDelete.push(file.path);
      }
    });
  }
  if (filesToDelete.length > 0) {
    Promise.all(filesToDelete.map((file) => deleteFileFromCloudinary(file)));
  }
};
