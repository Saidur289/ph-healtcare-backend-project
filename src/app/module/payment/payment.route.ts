import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { checkAuth } from "../../middleware/checkAuth";
import { PaymentController } from "./payment.controller";

const router = Router();
// ADMIN: payment list (the Stripe webhook is mounted separately in app.ts, with the raw body)
router.get("/", checkAuth(Role.ADMIN, Role.SUPER_ADMIN), PaymentController.getAllPayments);

export const PaymentRoutes = router;
