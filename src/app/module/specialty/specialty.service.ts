import { cached } from "../../utils/responseCache";
import { StatusCodes } from "http-status-codes";
import { audit } from "../../utils/audit";
import { deleteFileFromCloudinary } from "../../config/cloudinary.config";
import AppError from "../../errorHelpers/AppError";
import { INCLUDE_DELETED, prisma } from "../../lib/prisma";

type TSpecialtyInput = { title?: string; description?: string; icon?: string };

// doctor count is useful for the admin list and harmless in public
const withDoctorCount = { _count: { select: { doctorSpecialty: true } } } as const;

const createSpecialty = async (payload: TSpecialtyInput & { title: string }) => {
    // titles are unique across removed specialties too, so look at deleted rows as well
    const existing = await prisma.specialty.findUnique({ where: { title: payload.title, isDeleted: INCLUDE_DELETED } });
    if (existing && !existing.isDeleted) {
        throw new AppError(StatusCodes.CONFLICT, "A specialty with this title already exists");
    }
    if (existing) {
        // the title is unique, so a soft-deleted specialty is brought back instead
        return prisma.specialty.update({
            where: { id: existing.id },
            data: { ...payload, isDeleted: false, deletedAt: null },
            include: withDoctorCount,
        });
    }
    return prisma.specialty.create({ data: payload, include: withDoctorCount });
}

// deleted specialties are hidden everywhere
// PUBLIC: cached for up to 60 s (cleared on every change, see utils/responseCache.ts)
const getAllSpecialties = async () =>
    cached("specialties:all", () =>
        prisma.specialty.findMany({ where: { isDeleted: false }, orderBy: { title: "asc" }, include: withDoctorCount }),
    );

const updateSpecialty = async (id: string, payload: TSpecialtyInput) => {
    const current = await prisma.specialty.findFirst({ where: { id, isDeleted: false } });
    if (!current) throw new AppError(StatusCodes.NOT_FOUND, "Specialty not found");
    if (Object.keys(payload).length === 0) throw new AppError(StatusCodes.BAD_REQUEST, "Nothing to update");
    if (payload.title && payload.title !== current.title) {
        const taken = await prisma.specialty.findUnique({ where: { title: payload.title, isDeleted: INCLUDE_DELETED }, select: { id: true } });
        if (taken) throw new AppError(StatusCodes.CONFLICT, "A specialty with this title already exists");
    }
    const updated = await prisma.specialty.update({ where: { id }, data: payload, include: withDoctorCount });
    // old icon is removed only after the new one is saved
    if (payload.icon && current.icon && current.icon !== payload.icon) {
        await deleteFileFromCloudinary(current.icon).catch(() => undefined);
    }
    return updated;
}

// soft delete: doctors keep their link, but the specialty disappears from lists and profiles
const deleteSpecialty = async (id: string) => {
    const current = await prisma.specialty.findFirst({ where: { id, isDeleted: false }, select: { id: true } });
    if (!current) throw new AppError(StatusCodes.NOT_FOUND, "Specialty not found");
    const removed = await prisma.specialty.update({ where: { id }, data: { isDeleted: true, deletedAt: new Date() } });
    await audit({ action: "admin.delete", entityType: "Specialty", entityId: id });
    return removed;
}

export const SpecialtyService = {
    createSpecialty,
    getAllSpecialties,
    updateSpecialty,
    deleteSpecialty,
}
