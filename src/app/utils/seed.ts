import { Role } from "../../generated/prisma/enums";
import { envVars } from "../config/env";
import { auth } from "../lib/auth";
import { prisma } from "../lib/prisma";

// Creates the first SUPER_ADMIN from env vars. Safe to run on every start.
// Throws on failure so the server does not start in a broken state.
export const seedSuperAdmin = async () => {
  const superAdminExists = await prisma.user.findFirst({
    where: {
      role: Role.SUPER_ADMIN,
    },
    select: { id: true },
  });
  if (superAdminExists) {
    return null;
  }

  // a previous seed may have created the auth user but failed afterwards: reuse it
  let userId = (
    await prisma.user.findUnique({
      where: { email: envVars.SUPER_ADMIN_EMAIL },
      select: { id: true },
    })
  )?.id;
  let createdNow = false;
  if (!userId) {
    const data = await auth.api.signUpEmail({
      body: {
        name: envVars.SUPER_ADMIN_NAME,
        email: envVars.SUPER_ADMIN_EMAIL,
        password: envVars.SUPER_ADMIN_PASSWORD,
        rememberMe: false,
      },
    });
    userId = data.user.id;
    createdNow = true;
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          role: Role.SUPER_ADMIN,
          emailVerified: true,
          needPasswordChange: false,
        },
      });
      await tx.admin.upsert({
        where: { email: envVars.SUPER_ADMIN_EMAIL },
        update: { userId },
        create: {
          email: envVars.SUPER_ADMIN_EMAIL,
          name: envVars.SUPER_ADMIN_NAME,
          userId,
        },
      });
    });
    console.log("Super admin created");
  } catch (error) {
    // only remove a user this run created; never delete an existing account
    if (createdNow) {
      await prisma.user
        .delete({ where: { id: userId } })
        .catch((cleanupError) =>
          console.error("Failed to clean up super admin user:", cleanupError),
        );
    }
    throw error;
  }
};
