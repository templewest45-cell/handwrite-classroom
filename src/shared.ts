export interface Env {
  ROOM_DO: DurableObjectNamespace;
}

export type Capacity = 4 | 6 | 8;
export type RoomStatus = "CREATED" | "OPEN" | "LOCKED" | "CLOSED";
export type Role = "HOST" | "PLAYER";

export interface CreateRoomRequest {
  capacity: Capacity;
  questions?: string[];
}

export interface JoinRoomRequest {
  participantName?: string;
  resumeToken?: string;
}

export interface DeleteRoomRequest {
  hostKey?: string;
}

export interface SlotState {
  slotNumber: number;
  participantId: string | null;
  participantResumeTokenHash: string | null;
  participantName: string | null;
  connected: boolean;
  state: "EMPTY" | "JOINED" | "SUBMITTED";
  draftPreview: string | null;
  finalImage: string | null;
  grade: "O" | "X" | null;
}

export interface RoomState {
  roomId: string;
  hostKeyHash: string;
  capacity: Capacity;
  questions: string[];
  status: RoomStatus;
  createdAt: string;
  expiresAt: string;
  currentQuestionPos: number;
  liveSlot: number | null;
  slots: Record<number, SlotState>;
}

export interface AuditEvent {
  ts: string;
  type: string;
  detail?: Record<string, unknown>;
}

export interface SocketMeta {
  role: Role;
  participantId?: string;
}

export const ROOM_TTL_MS = 2 * 60 * 60 * 1000;

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export function htmlResponse(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export function iconResponse(): Response {
  const b64 = "R0lGODlhAQABAIABAP///wAAACwAAAAAAQABAAACAkQBADs=";
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new Response(bytes, {
    status: 200,
    headers: {
      "content-type": "image/gif",
      "cache-control": "public, max-age=86400",
    },
  });
}

export function errorResponse(status: number, error: string): Response {
  return jsonResponse({ error }, status);
}

export function randomId(prefix: string, length: number): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = prefix;
  for (let i = 0; i < bytes.length; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(hash);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function parseOptionalJson<T>(request: Request): Promise<T> {
  const raw = await request.text();
  if (!raw.trim()) {
    return {} as T;
  }
  return JSON.parse(raw) as T;
}

export function isWebSocketUpgrade(request: Request): boolean {
  return request.headers.get("upgrade")?.toLowerCase() === "websocket";
}

export function isValidCapacity(value: unknown): value is Capacity {
  return value === 4 || value === 6 || value === 8;
}
