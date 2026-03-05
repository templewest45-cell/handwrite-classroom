export interface BaseWsMessage {
  type: string;
}

export interface PreviewUpdateMessage extends BaseWsMessage {
  type: "preview:update";
  preview: string;
}

export interface StrokeBatchMessage extends BaseWsMessage {
  type: "stroke:batch";
  strokes: unknown;
}

export interface LiveSetMessage extends BaseWsMessage {
  type: "live:set";
  slotNumber: number | null;
}

export interface ControlMessage extends BaseWsMessage {
  type: "control:open" | "control:lock" | "control:next" | "control:end";
}

export interface FinalSubmitMessage extends BaseWsMessage {
  type: "final:submit";
  finalImage: string;
}

export interface GradeSetMessage extends BaseWsMessage {
  type: "grade:set";
  slotNumber: number;
  grade: "O" | "X";
}

export interface ResubmitAllowMessage extends BaseWsMessage {
  type: "resubmit:allow";
  slotNumber: number;
}

export function parseWsMessage(input: unknown): BaseWsMessage | null {
  if (typeof input !== "string") {
    return null;
  }
  try {
    const parsed = JSON.parse(input);
    if (!parsed || typeof parsed !== "object" || typeof (parsed as { type?: unknown }).type !== "string") {
      return null;
    }
    return parsed as BaseWsMessage;
  } catch {
    return null;
  }
}
