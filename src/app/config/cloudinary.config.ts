import { v2 as cloudinary, UploadApiResponse } from "cloudinary"
import AppError from "../errorHelpers/AppError";
import { StatusCodes } from "http-status-codes";
import { envVars } from "./env";

cloudinary.config({
    cloud_name: envVars.CLOUDINARY.CLOUDINARY_CLOUD_NAME,
    api_key: envVars.CLOUDINARY.CLOUDINARY_API_KEY,
    api_secret: envVars.CLOUDINARY.CLOUDINARY_API_SECRET
})
export const uploadFileToCloudinary = async (buffer: Buffer, fileName: string): Promise<UploadApiResponse> => {
    if (!buffer || !fileName) {
        throw new AppError(StatusCodes.BAD_REQUEST, "Invalid file buffer or file name");
    }
    const extension = fileName.split(".").pop()?.toLocaleLowerCase();
    const fileNameWithoutExtension = fileName.split(".").slice(0, -1).join(".").toLocaleLowerCase().replace(/\s/g, "_");
    const uniqueName = Math.random().toString(36).substring(2) + Date.now() + "-" + fileNameWithoutExtension
    const folder = extension === "pdf" ? "pdfs" : "images"
    return new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream({
            resource_type: "auto",
            folder: `ph-healthcare/${folder}`,
            public_id: `ph-healthcare/${folder}/${uniqueName}`,
        },
            (error, result) => {
                if (error) {
                    return reject(new AppError(StatusCodes.BAD_REQUEST, error.message))
                }
                if (result) {
                    resolve(result as UploadApiResponse)
                }
            }

        ).end(buffer)
    })
}
// accepts a stored Cloudinary URL; the resource type (image / raw / video) is read from it
export const deleteFileFromCloudinary = async (url: string) => {
    // private files are stored as "private:<resourceType>:<publicId>:<format>" (config/privateFiles.ts)
    if (url.startsWith("private:")) {
        const [resourceType, publicId] = url.slice("private:".length).split(":");
        if (!resourceType || !publicId) return;
        try {
            await cloudinary.uploader.destroy(publicId, { resource_type: resourceType, type: "authenticated", invalidate: true });
        } catch (error) {
            console.error("Error deleting private file from Cloudinary:", (error as Error)?.message);
            throw new AppError(StatusCodes.INTERNAL_SERVER_ERROR, "Error deleting file from Cloudinary");
        }
        return;
    }
    const match = url.match(/\/(image|raw|video)\/upload\/(?:v\d+\/)?(.+?)(\.[a-zA-Z0-9]+)?$/);
    if (!match) return;
    const [, resourceType, path, extension] = match;
    // raw files keep their extension in the public id
    const publicId = resourceType === "raw" && extension ? path + extension : path;
    try {
        await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
    } catch (error) {
        console.error("Error deleting file from Cloudinary:", (error as Error)?.message);
        throw new AppError(StatusCodes.INTERNAL_SERVER_ERROR, "Error deleting file from Cloudinary");
    }
}
export const cloudinaryUpload = cloudinary