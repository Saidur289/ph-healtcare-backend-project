import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";


const connectionString = `${process.env.DATABASE_URL}`;

const adapter = new PrismaPg({ connectionString });
const baseClient = new PrismaClient({ adapter });

// Soft delete: reads on these models skip deleted rows unless the query names `isDeleted`
// itself (e.g. `where: { isDeleted: true }`, or `isDeleted: undefined` = include deleted).
// User is not listed: the auth code checks deleted / blocked accounts itself, and
// better-auth must still see a deleted email to refuse re-registering it.
// Relations loaded with include/select are not filtered (old appointments keep showing
// a doctor who has since been removed).
const SOFT_DELETE_MODELS = new Set(["Doctor", "Patient", "Admin", "SuperAdmin", "Specialty"]);
const READ_OPERATIONS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
]);

// typed as the plain client: the extension only adds a filter, it does not change any API
const prisma = baseClient.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (SOFT_DELETE_MODELS.has(model) && READ_OPERATIONS.has(operation)) {
          const queryArgs = (args ?? {}) as { where?: Record<string, unknown> };
          const where = queryArgs.where ?? {};
          if (!("isDeleted" in where)) {
            queryArgs.where = { ...where, isDeleted: false };
            return query(queryArgs as typeof args);
          }
        }
        return query(args);
      },
    },
  },
}) as unknown as PrismaClient;

// pass as `isDeleted` inside a where to also read soft-deleted rows
export const INCLUDE_DELETED = undefined;

export { prisma };
