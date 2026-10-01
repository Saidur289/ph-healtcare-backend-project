import { Request, Response } from "express"
import { catchAsync } from "../../shared/catchAsync"
import { sendResponse } from "../../shared/sendResponse"
import { AdminService } from "./admin.service"

const getAllAdmin = catchAsync(async (req: Request, res: Response) => {
    const result = await AdminService.getAllAdmin()
    sendResponse(res, {
        success: true,
        httpStatusCode: 200,
        message: "Admin retrieved successfully",
        data: result
    })
})
const getAdminById = catchAsync(async (req: Request, res: Response) => {
    const adminId = req.params.id
    const result = await AdminService.getAdminById(adminId as string)
    sendResponse(res, {
        success: true,
        httpStatusCode: 200,
        message: "Admin retrieved successfully",
        data: result
    })
})
const updateAdmin = catchAsync(async (req: Request, res: Response) => {
    const adminId = req.params.id
    const payload = req.body
    const result = await AdminService.updateAdmin(adminId as string, payload)
    sendResponse(res, {
        success: true,
        httpStatusCode: 200,
        message: "Admin updated successfully",
        data: result
    })
})
const deleteAdmin = catchAsync(async (req: Request, res: Response) => {
    const adminId = req.params.id
    const user = req.user
    if (!user) return
    const result = await AdminService.deleteAdmin(adminId as string, user)
    sendResponse(res, {
        success: true,
        httpStatusCode: 200,
        message: "Admin deleted successfully",
        data: result
    })
})
const changeUserStatus = catchAsync(async (req: Request, res: Response) => {
    const result = await AdminService.changeUserStatus(req.user, req.body)
    sendResponse(res, {
        success: true,
        httpStatusCode: 200,
        message: "User status changed successfully",
        data: result
    })
})
const changeUserRole = catchAsync(async (req: Request, res: Response) => {
    const result = await AdminService.changeUserRole(req.user, req.body)
    sendResponse(res, {
        success: true,
        httpStatusCode: 200,
        message: "User role changed successfully",
        data: result
    })
})
export const AdminController = {
    getAllAdmin,
    getAdminById,
    updateAdmin,
    deleteAdmin,
    changeUserStatus,
    changeUserRole
}