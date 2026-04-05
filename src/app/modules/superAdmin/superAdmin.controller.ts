import { Request, Response } from "express"
import { catchAsync } from "../../shared/catchAsync"
import { sendResponse } from "../../shared/sendResponse"
import { SuperAdminService } from "./superAdmin.service"


const getAllSuperAdmin = catchAsync(async (req: Request, res: Response) => {
    const result = await SuperAdminService.getAllSuperAdmin()
    sendResponse(res, {
        success: true,
        httpStatusCode: 200,
        message: "Super Admin retrieved successfully",
        data: result
    })
})
const getSuperAdminById = catchAsync(async (req: Request, res: Response) => {
    const superAdminId = req.params.id
    const result = await SuperAdminService.getSuperAdminById(superAdminId as string)
    sendResponse(res, {
        success: true,
        httpStatusCode: 200,
        message: "Super Admin retrieved successfully",
        data: result
    })
})
const updateSuperAdmin = catchAsync(async (req: Request, res: Response) => {
    const superAdminId = req.params.id
    const payload = req.body
    const result = await SuperAdminService.updateSuperAdmin(superAdminId as string, payload)
    sendResponse(res, {
        success: true,
        httpStatusCode: 200,
        message: " SuperAdmin updated successfully",
        data: result
    })
})
const deleteSuperAdmin = catchAsync(async (req: Request, res: Response) => {
    const superAdminId = req.params.id
    const result = await SuperAdminService.deleteSuperAdmin(superAdminId as string)
    sendResponse(res, {
        success: true,
        httpStatusCode: 200,
        message: "SuperAdmin deleted successfully",
        data: result
    })
})
export const SuperAdminController = {
    getAllSuperAdmin,
    getSuperAdminById,
    updateSuperAdmin,
    deleteSuperAdmin

}