import { StatusCodes } from "http-status-codes";
import AppError from "../../errorHelpers/AppError";

// Daily.co REST API (https://docs.daily.co/reference/rest-api). The API key stays on the server;
// the browser only ever gets a short-lived meeting token for ONE private room.
const DAILY_API = process.env.DAILY_API_URL || "https://api.daily.co/v1";

// throws 503 when the video provider is not set up
export const assertVideoConfigured = () => {
  getApiKey();
};

const getApiKey = () => {
  const key = process.env.DAILY_API_KEY;
  if (!key) {
    throw new AppError(
      StatusCodes.SERVICE_UNAVAILABLE,
      "Video calls are not configured yet (DAILY_API_KEY is missing)",
    );
  }
  return key;
};

const dailyRequest = async <T>(method: string, path: string, body?: unknown): Promise<{ status: number; data: T }> => {
  const res = await fetch(`${DAILY_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as T;
  return { status: res.status, data };
};

type TDailyRoom = { name: string; url: string };

// One private room per appointment (name = appointment.videoCallingId). Created on first join.
export const ensureRoom = async (name: string, expiresAt: Date) => {
  const existing = await dailyRequest<TDailyRoom>("GET", `/rooms/${encodeURIComponent(name)}`);
  if (existing.status === 200) return existing.data;

  const created = await dailyRequest<TDailyRoom & { error?: string; info?: string }>("POST", "/rooms", {
    name,
    privacy: "private", // a meeting token is required to enter
    properties: {
      exp: Math.floor(expiresAt.getTime() / 1000), // the room disappears after the slot
      eject_at_room_exp: true,
      enable_prejoin_ui: true, // camera / microphone check before joining
      enable_knocking: false,
      max_participants: 2,
    },
  });
  if (created.status !== 200) {
    console.error("[daily] room creation failed:", created.status, created.data?.info ?? created.data?.error);
    throw new AppError(StatusCodes.BAD_GATEWAY, "The video service is not available right now");
  }
  return created.data;
};

// Token valid only for this room, this person, and a short time window.
export const createMeetingToken = async (input: {
  roomName: string;
  userName: string;
  isOwner: boolean;
  notBefore: Date;
  expiresAt: Date;
}) => {
  const res = await dailyRequest<{ token?: string; info?: string }>("POST", "/meeting-tokens", {
    properties: {
      room_name: input.roomName,
      user_name: input.userName,
      is_owner: input.isOwner, // the doctor can remove participants
      nbf: Math.floor(input.notBefore.getTime() / 1000),
      exp: Math.floor(input.expiresAt.getTime() / 1000),
      eject_at_token_exp: true,
    },
  });
  if (res.status !== 200 || !res.data.token) {
    console.error("[daily] token creation failed:", res.status, res.data?.info);
    throw new AppError(StatusCodes.BAD_GATEWAY, "The video service is not available right now");
  }
  return res.data.token;
};
