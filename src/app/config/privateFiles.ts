import { randomUUID } from "crypto";
import { cloudinaryUpload } from "./cloudinary.config";

// Medical reports, prescription PDFs and invoices are stored as Cloudinary "authenticated"
// files: the plain delivery URL returns 401. The database keeps a reference
// ("private:<resourceType>:<publicId>:<format>"), never a working link, and readers get a
// download link that expires (see signedFileUrl) from an endpoint that checks ownership.
export const PRIVATE_LINK_TTL_SECONDS = 5 * 60;
const PREFIX = "private:";

export type TPrivateRef = { resourceType: string; publicId: string; format: string };

export const isPrivateRef = (value?: string | null): value is string => Boolean(value?.startsWith(PREFIX));

const toRef = ({ resourceType, publicId, format }: TPrivateRef) => `${PREFIX}${resourceType}:${publicId}:${format}`;

export const parsePrivateRef = (value: string): TPrivateRef | null => {
  if (!isPrivateRef(value)) return null;
  const [resourceType, publicId, format] = value.slice(PREFIX.length).split(":");
  return resourceType && publicId && format ? { resourceType, publicId, format } : null;
};

// legacy public URL (https://res.cloudinary.com/<cloud>/<type>/upload/v123/<publicId>.<ext>)
export const parsePublicUrl = (url: string): (TPrivateRef & { type: string }) | null => {
  const match = url.match(/\/(image|raw|video)\/(upload|authenticated)\/(?:s--[^/]+--\/)?(?:v\d+\/)?(.+?)\.([a-zA-Z0-9]+)$/);
  return match ? { resourceType: match[1], type: match[2], publicId: match[3], format: match[4].toLowerCase() } : null;
};

export const uploadPrivateFile = (buffer: Buffer, format: string, folder: string) =>
  new Promise<string>((resolve, reject) => {
    cloudinaryUpload.uploader
      .upload_stream(
        { type: "authenticated", resource_type: "image", folder: `ph-healthcare/private/${folder}`, public_id: randomUUID(), format },
        (error, result) =>
          error || !result
            ? reject(error ?? new Error("Upload failed"))
            : resolve(toRef({ resourceType: result.resource_type, publicId: result.public_id, format })),
      )
      .end(buffer);
  });

// short-lived download link for a stored reference
export const signedFileUrl = (stored: string, ttlSeconds = PRIVATE_LINK_TTL_SECONDS) => {
  const ref = parsePrivateRef(stored);
  if (!ref) return null;
  return cloudinaryUpload.utils.private_download_url(ref.publicId, ref.format, {
    resource_type: ref.resourceType,
    type: "authenticated",
    expires_at: Math.floor(Date.now() / 1000) + ttlSeconds,
  });
};

export const deletePrivateFile = async (stored: string) => {
  const ref = parsePrivateRef(stored);
  if (!ref) return;
  await cloudinaryUpload.uploader.destroy(ref.publicId, { resource_type: ref.resourceType, type: "authenticated", invalidate: true });
};

// moves an old public file to private storage (used by the migration script)
export const makeFilePrivate = async (publicUrl: string) => {
  const parsed = parsePublicUrl(publicUrl);
  if (!parsed) return null;
  if (parsed.type !== "authenticated") {
    await cloudinaryUpload.uploader.rename(parsed.publicId, parsed.publicId, {
      resource_type: parsed.resourceType,
      type: "upload",
      to_type: "authenticated",
      invalidate: true,
      overwrite: true,
    });
  }
  return toRef(parsed);
};
