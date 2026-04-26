/* eslint-disable @typescript-eslint/no-explicit-any */
import { Role } from "../../generated/prisma/enums";
import { envVars } from "../config/env";
import { auth } from "../lib/auth";
import { prisma } from "../lib/prisma";

export const seedSuperAdmin = async () => {
  try {
    const superAdminExits = await prisma.user.findFirst({
      where: {
        role: Role.SUPER_ADMIN,
      },
    });
    if (superAdminExits) {
      console.log("super admin already exits");
      return null;
    }
    //SIGNUP
    const data = await auth.api.signUpEmail({
      body: {
        name: envVars.SUPER_ADMIN_NAME,
        email: envVars.SUPER_ADMIN_EMAIL,
        password: envVars.SUPER_ADMIN_PASSWORD,
        rememberMe: false,
        needPasswordChange: false,
      },
    });
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: {
          id: data.user.id,
        },
        data: {
          role: Role.SUPER_ADMIN,
          emailVerified: true,
        },
      });
      await tx.admin.create({
        data: {
          email: envVars.SUPER_ADMIN_EMAIL,
          name: envVars.SUPER_ADMIN_NAME,
          userId: data.user.id,
        },
      });
    });
    const result = await prisma.admin.findFirst({
      where: {
        id: envVars.SUPER_ADMIN_EMAIL,
      },
      include: {
        user: true,
      },
    });
    console.log(`super admin created ${result}`);
  } catch (error: any) {
    console.log("error in seed admin", error.message);
    await prisma.user.delete({ where: { email: envVars.SUPER_ADMIN_EMAIL } });
  }
};
