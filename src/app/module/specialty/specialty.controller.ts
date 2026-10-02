
import { catchAsync } from "../../shared/catchAsync";
import { Request, Response } from "express";
import { SpecialtyService } from "./specialty.service";
import { sendResponse } from "../../shared/sendResponse";
import { StatusCodes } from "http-status-codes";
import AppError from "../../errorHelpers/AppError";


// icons must be images (the shared upload filter also allows PDF)
const iconPath = (req: Request) => {
    if (req.file && !req.file.mimetype.startsWith("image/")) {
        throw new AppError(StatusCodes.BAD_REQUEST, "The icon must be a JPG, PNG or WEBP image");
    }
    return req.file?.path;
}

const createSpecialty = catchAsync(async (req: Request, res: Response) => {
    const icon = iconPath(req)
    const payload = { ...req.body, ...(icon ? { icon } : {}) }
    const result = await SpecialtyService.createSpecialty(payload);
    sendResponse(res, {
        httpStatusCode: 201,
        success: true,
        message: "Specialty created successfully",
        data: result
    })
})
const getAllSpecialties = catchAsync(async (req: Request, res: Response) => {
    const result = await SpecialtyService.getAllSpecialties();
    sendResponse(res, {
        httpStatusCode: 200,
        success: true,
        message: "Specialties fetched successfully",
        data: result
    })
})
const updateSpecialty = catchAsync(async (req: Request, res: Response) => {
    const icon = iconPath(req)
    const result = await SpecialtyService.updateSpecialty(req.params.id as string, { ...req.body, ...(icon ? { icon } : {}) })
    sendResponse(res, {
        httpStatusCode: 200,
        success: true,
        message: "Specialty updated successfully",
        data: result
    })
})
const deleteSpecialty = catchAsync(async (req: Request, res: Response) => {
    const { id } = req.params
    const result = await SpecialtyService.deleteSpecialty(id as string)
    sendResponse(res, {
        httpStatusCode: 200,
        success: true,
        message: 'Specialty deleted successfully',
        data: result

    })
})
export const SpecialtyController = {
    createSpecialty,
    getAllSpecialties,
    updateSpecialty,
    deleteSpecialty
}