import { Request, Response, Router } from "express";
import { z } from "zod";
import { StatusCodes } from "http-status-codes";
import { Role } from "../../../generated/prisma/enums";
import AppError from "../../errorHelpers/AppError";
import { checkAuth } from "../../middleware/checkAuth";
import { catchAsync } from "../../shared/catchAsync";
import { sendResponse } from "../../shared/sendResponse";
import { FilesService } from "./files.service";

const router = Router();
const id = (req: Request) => {
  const parsed = z.uuid().safeParse(req.params.id);
  if (!parsed.success) throw new AppError(StatusCodes.NOT_FOUND, "File not found");
  return parsed.data;
};
const respond = (res: Response, data: { url: string; expiresInSeconds: number }) => {
  // the link itself is a secret for a few minutes: never cache it
  res.setHeader("Cache-Control", "no-store");
  sendResponse(res, { httpStatusCode: 200, success: true, message: "Download link created", data });
};

// GET -> { url, expiresInSeconds }; every call is written to the audit log
router.get(
  "/reports/:id",
  checkAuth(Role.PATIENT),
  catchAsync(async (req, res) => respond(res, await FilesService.getReportLink(req.user, id(req)))),
);
router.get(
  "/prescriptions/:id",
  checkAuth(Role.PATIENT, Role.DOCTOR),
  catchAsync(async (req, res) => respond(res, await FilesService.getPrescriptionLink(req.user, id(req)))),
);
router.get(
  "/invoices/:id",
  checkAuth(Role.PATIENT, Role.ADMIN, Role.SUPER_ADMIN),
  catchAsync(async (req, res) => respond(res, await FilesService.getInvoiceLink(req.user, id(req)))),
);

export const FilesRoutes = router;
