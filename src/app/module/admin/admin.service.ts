import { StatusCodes } from "http-status-codes";
import { audit } from "../../utils/audit";
import AppError from "../../errorHelpers/AppError";
import { prisma } from "../../lib/prisma";
import {
  IChangeUserRolePayload,
  IChangeUserStatusPayload,
  IUpdateAdminPayload,
} from "./admin.interface";
import { IRequestUser } from "../../interface/requestUser.interface";
import { Role, UserStatus } from "../../../generated/prisma/enums";

const getAllAdmin = async () => {
  const result = await prisma.admin.findMany({
    where: {
      isDeleted: false,
    },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
      name: true,
      email: true,
      profilePhoto: true,
      contactNumber: true,
      createdAt: true,
      // user id is needed for status / role changes
      user: {
        select: {
          id: true,
          role: true,
          status: true,
        },
      },
    },
  });

  return result;
};
const getAdminById = async (adminId: string) => {
  const admin = await prisma.admin.findFirst({
    where: {
      id: adminId,
      isDeleted: false,
    },
  });
  if (!admin) {
    throw new AppError(StatusCodes.NOT_FOUND, "Admin not found");
  }
  return admin;
};
const updateAdmin = async (adminId: string, payload: IUpdateAdminPayload) => {
  // check if admin exists
  const isAdminExists = await prisma.admin.findFirst({
    where: {
      id: adminId,
      isDeleted: false,
    },
  });
  if (!isAdminExists) {
    throw new AppError(StatusCodes.NOT_FOUND, "admin not found");
  }
  // the body is flat ({ name, profilePhoto, contactNumber }); copy only allowed fields
  const { name, profilePhoto, contactNumber } = payload;
  const updatedAdmin = await prisma.admin.update({
    where: {
      id: adminId,
    },
    data: { name, profilePhoto, contactNumber },
  });

  return updatedAdmin;
};
const deleteAdmin = async (adminId: string, user: IRequestUser) => {
  const existsAdmin = await prisma.admin.findUnique({
    where: {
      id: adminId,
    },
    include: { user: { select: { role: true } } },
  });
  if (!existsAdmin) {
    throw new AppError(StatusCodes.NOT_FOUND, "Admin not found");
  }
  if (existsAdmin.isDeleted) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Admin is already deleted");
  }
  // compare User ids (admin.userId), not the Admin profile id
  if (existsAdmin.userId === user.userId) {
    throw new AppError(StatusCodes.BAD_REQUEST, "You cannot delete yourself");
  }
  if (existsAdmin.user.role === Role.SUPER_ADMIN) {
    throw new AppError(StatusCodes.FORBIDDEN, "Super admin cannot be deleted");
  }
  const result = await prisma.$transaction(async (tx) => {
    await tx.admin.update({
      where: {
        id: adminId,
      },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
      },
    });
    await tx.user.update({
      where: { id: existsAdmin.userId },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        status: UserStatus.DELETED,
      },
    });
    await tx.session.deleteMany({
      where: { userId: existsAdmin.userId },
    });
    // read with tx (getAdminById uses the global client and hides deleted admins)
    return tx.admin.findUniqueOrThrow({ where: { id: adminId } });
  });
  await audit({ action: "admin.delete", entityType: "Admin", entityId: adminId });
  return result;
};

// Rules:
// - nobody can change their own status, and a SUPER_ADMIN's status can't be changed here
// - ADMIN can block/unblock doctors and patients only
// - SUPER_ADMIN can also block/unblock admins
// - deleting is not done here (use the delete endpoints)
// - blocking ends all of the user's sessions immediately
const changeUserStatus = async (
  user: IRequestUser,
  payload: IChangeUserStatusPayload,
) => {
  const { userId, userStatus } = payload;
  if (userStatus === UserStatus.DELETED) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Use the delete endpoint to delete a user");
  }
  if (user.userId === userId) {
    throw new AppError(StatusCodes.BAD_REQUEST, "You cannot change your own status");
  }
  const userToChangeStatus = await prisma.user.findUnique({
    where: {
      id: userId,
    },
  });
  if (!userToChangeStatus || userToChangeStatus.isDeleted) {
    throw new AppError(StatusCodes.NOT_FOUND, "User not found");
  }
  if (userToChangeStatus.role === Role.SUPER_ADMIN) {
    throw new AppError(StatusCodes.FORBIDDEN, "A super admin's status cannot be changed");
  }
  if (user.role === Role.ADMIN && userToChangeStatus.role === Role.ADMIN) {
    throw new AppError(StatusCodes.FORBIDDEN, "Only a super admin can change an admin's status");
  }
  if (userToChangeStatus.status === userStatus) {
    throw new AppError(StatusCodes.BAD_REQUEST, "User already has this status");
  }
  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: userId },
      data: { status: userStatus },
      select: { id: true, email: true, role: true, status: true },
    });
    if (userStatus !== UserStatus.ACTIVE) {
      await tx.session.deleteMany({ where: { userId } });
    }
    return updated;
  });
  await audit({ action: "user.status_change", entityType: "User", entityId: userId, meta: { from: userToChangeStatus.status, to: userStatus } });
  return result;
};

// Only SUPER_ADMIN (route guard) can promote an ADMIN to SUPER_ADMIN or demote one back.
// Doctor/patient roles are never changed here. The last super admin can't be demoted.
const changeUserRole = async (
  user: IRequestUser,
  payload: IChangeUserRolePayload,
) => {
  const { userId, role } = payload;
  if (user.userId === userId) {
    throw new AppError(StatusCodes.BAD_REQUEST, "You cannot change your own role");
  }
  if (role !== Role.ADMIN && role !== Role.SUPER_ADMIN) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Role can only be ADMIN or SUPER_ADMIN");
  }
  const userToChangeRole = await prisma.user.findUnique({
    where: {
      id: userId,
    },
  });
  if (!userToChangeRole || userToChangeRole.isDeleted) {
    throw new AppError(StatusCodes.NOT_FOUND, "User not found");
  }
  if (userToChangeRole.role !== Role.ADMIN && userToChangeRole.role !== Role.SUPER_ADMIN) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "Doctor and patient roles cannot be changed",
    );
  }
  if (userToChangeRole.role === role) {
    throw new AppError(StatusCodes.BAD_REQUEST, "User already has this role");
  }
  const result = await prisma.$transaction(async (tx) => {
    if (userToChangeRole.role === Role.SUPER_ADMIN) {
      const superAdminCount = await tx.user.count({
        where: { role: Role.SUPER_ADMIN, isDeleted: false },
      });
      if (superAdminCount <= 1) {
        throw new AppError(StatusCodes.BAD_REQUEST, "The last super admin cannot be demoted");
      }
    }
    const updated = await tx.user.update({
      where: { id: userId },
      data: { role },
      select: { id: true, email: true, role: true, status: true },
    });
    // tokens carry the old role: force a fresh login
    await tx.session.deleteMany({ where: { userId } });
    return updated;
  });
  await audit({ action: "user.role_change", entityType: "User", entityId: userId, meta: { from: userToChangeRole.role, to: role } });
  return result;
};
export const AdminService = {
  getAllAdmin,
  getAdminById,
  deleteAdmin,
  updateAdmin,
  changeUserStatus,
  changeUserRole,
};
