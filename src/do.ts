import {
  AuditEvent,
  Env,
  errorResponse,
  isValidCapacity,
  isWebSocketUpgrade,
  JoinRoomRequest,
  jsonResponse,
  parseOptionalJson,
  QuestionResult,
  randomId,
  ROOM_TTL_MS,
  RoomState,
  SlotState,
  SocketMeta,
  sha256Hex,
} from "./shared";
import {
  ControlMessage,
  FinalSubmitMessage,
  GradeSetMessage,
  LiveSetMessage,
  parseWsMessage,
  ParticipantRemoveMessage,
  PreviewUpdateMessage,
  ResubmitAllowMessage,
  StrokeBatchMessage,
} from "./protocol";

export class RoomDurableObject {
  private readonly ctx: DurableObjectState;
  private readonly env: Env;
  private readonly hostSockets = new Set<WebSocket>();
  private readonly playerSockets = new Map<string, Set<WebSocket>>();
  private readonly socketMeta = new Map<WebSocket, SocketMeta>();
  private readonly hostAuthFailures = new Map<string, number[]>();
  private readonly hostAuthBlockedUntil = new Map<string, number>();
  private static readonly WS_MAX_MESSAGE_BYTES = 256 * 1024;
  private static readonly HOST_AUTH_WINDOW_MS = 5 * 60 * 1000;
  private static readonly HOST_AUTH_MAX_FAILURES = 5;
  private static readonly HOST_AUTH_BLOCK_MS = 10 * 60 * 1000;

  constructor(ctx: DurableObjectState, env: Env) {
    this.ctx = ctx;
    this.env = env;
  }

  private async appendAudit(type: string, detail?: Record<string, unknown>): Promise<void> {
    const current = (await this.ctx.storage.get<AuditEvent[]>("auditLog")) ?? [];
    current.push({ ts: new Date().toISOString(), type, detail });
    const trimmed = current.length > 200 ? current.slice(current.length - 200) : current;
    await this.ctx.storage.put("auditLog", trimmed);
    if (detail) {
      console.log("[audit]", type, JSON.stringify(detail));
    } else {
      console.log("[audit]", type);
    }
  }

  private async loadAudit(): Promise<AuditEvent[]> {
    return (await this.ctx.storage.get<AuditEvent[]>("auditLog")) ?? [];
  }

  private send(ws: WebSocket, message: unknown): void {
    try {
      ws.send(JSON.stringify(message));
    } catch {
      ws.close(1011, "send_failed");
    }
  }

  private broadcastToHosts(message: unknown): void {
    for (const ws of this.hostSockets) {
      this.send(ws, message);
    }
  }

  private broadcastToPlayers(message: unknown): void {
    for (const sockets of this.playerSockets.values()) {
      for (const ws of sockets) {
        this.send(ws, message);
      }
    }
  }

  private sendToParticipant(participantId: string, message: unknown): void {
    const sockets = this.playerSockets.get(participantId);
    if (!sockets) {
      return;
    }
    for (const ws of sockets) {
      this.send(ws, message);
    }
  }

  private getCurrentQuestionText(room: RoomState): string {
    const list = Array.isArray((room as { questions?: unknown }).questions) ? room.questions : [];
    const index = Math.max(0, room.currentQuestionPos - 1);
    const fromList = list[index];
    return fromList || `第${room.currentQuestionPos}問`;
  }

  private buildQuestionResult(room: RoomState): QuestionResult {
    const questionPos = Math.max(1, Number(room.currentQuestionPos) || 1);
    const questionText = this.getCurrentQuestionText(room);
    const results = Object.values(room.slots)
      .filter((slot) => !!slot.participantId)
      .sort((a, b) => a.slotNumber - b.slotNumber)
      .map((slot) => ({
        slotNumber: slot.slotNumber,
        participantId: slot.participantId,
        participantName: slot.participantName,
        grade: slot.grade,
        finalImage: slot.finalImage,
      }));
    return { questionPos, questionText, results };
  }

  private upsertQuestionResult(room: RoomState): void {
    const current = Array.isArray(room.questionResults) ? room.questionResults : [];
    const next = this.buildQuestionResult(room);
    const idx = current.findIndex((q) => q.questionPos === next.questionPos);
    if (idx >= 0) {
      current[idx] = next;
    } else {
      current.push(next);
      current.sort((a, b) => a.questionPos - b.questionPos);
    }
    room.questionResults = current;
  }

  private broadcastRoomStatus(room: RoomState): void {
    const questionText = room.status === "CREATED" ? null : this.getCurrentQuestionText(room);
    const payload = {
      type: "room:status",
      status: room.status,
      currentQuestionPos: room.currentQuestionPos,
      questionText,
    };
    this.broadcastToHosts(payload);
    this.broadcastToPlayers(payload);
  }

  private closeAllSockets(code: number, reason: string): void {
    for (const ws of this.hostSockets) {
      try {
        ws.close(code, reason);
      } catch {}
    }
    for (const sockets of this.playerSockets.values()) {
      for (const ws of sockets) {
        try {
          ws.close(code, reason);
        } catch {}
      }
    }
    this.hostSockets.clear();
    this.playerSockets.clear();
    this.socketMeta.clear();
  }

  private buildPublicSummary(room: RoomState): {
    roomId: string;
    status: string;
    currentQuestionPos: number;
    questionText: string;
    totals: { joined: number; submitted: number; graded: number; correct: number; incorrect: number };
    students?: Array<{ participantId: string; participantName: string | null; correct: number; graded: number; accuracy: number }>;
    questions?: QuestionResult[];
    slots: Array<{
      slotNumber: number;
      participantName: string | null;
      state: string;
      grade: "O" | "X" | null;
      previewImage: string | null;
    }>;
  } {
    const list = Object.values(room.slots).sort((a, b) => a.slotNumber - b.slotNumber);
    const slots = list.map((slot) => ({
      slotNumber: slot.slotNumber,
      participantName: slot.participantName,
      state: slot.state,
      grade: slot.grade,
      previewImage: slot.draftPreview ?? slot.finalImage,
    }));
    const joined = list.filter((s) => !!s.participantId).length;
    const submitted = list.filter((s) => s.state === "SUBMITTED").length;
    const graded = list.filter((s) => s.grade === "O" || s.grade === "X").length;
    const correct = list.filter((s) => s.grade === "O").length;
    const incorrect = list.filter((s) => s.grade === "X").length;
    const history = Array.isArray(room.questionResults) ? room.questionResults : [];
    const studentsMap = new Map<string, { participantId: string; participantName: string | null; correct: number; graded: number }>();
    for (const q of history) {
      for (const r of q.results) {
        if (!r.participantId) continue;
        const cur = studentsMap.get(r.participantId) ?? {
          participantId: r.participantId,
          participantName: r.participantName,
          correct: 0,
          graded: 0,
        };
        if (cur.participantName === null && r.participantName) {
          cur.participantName = r.participantName;
        }
        if (r.grade === "O" || r.grade === "X") {
          cur.graded += 1;
          if (r.grade === "O") cur.correct += 1;
        }
        studentsMap.set(r.participantId, cur);
      }
    }
    const students = Array.from(studentsMap.values())
      .map((s) => ({
        ...s,
        accuracy: s.graded > 0 ? Math.round((s.correct / s.graded) * 100) : 0,
      }))
      .sort((a, b) => b.accuracy - a.accuracy || a.participantId.localeCompare(b.participantId));
    return {
      roomId: room.roomId,
      status: room.status,
      currentQuestionPos: room.currentQuestionPos,
      questionText: this.getCurrentQuestionText(room),
      totals: { joined, submitted, graded, correct, incorrect },
      students,
      questions: history,
      slots,
    };
  }

  private async loadRoom(): Promise<RoomState | null> {
    const room = (await this.ctx.storage.get<RoomState>("room")) ?? null;
    if (!room) {
      return null;
    }
    const now = Date.now();
    const exp = new Date(room.expiresAt).getTime();
    if (now > exp && room.status !== "CLOSED") {
      room.status = "CLOSED";
      room.liveSlot = null;
      await this.ctx.storage.put("room", room);
      await this.appendAudit("room_expired_auto_closed", { roomId: room.roomId });
      this.broadcastRoomStatus(room);
      this.broadcastToPlayers({ type: "answer:lock", locked: true });
    }
    return room;
  }

  private getClientKey(request: Request): string {
    return request.headers.get("x-client-ip") || request.headers.get("cf-connecting-ip") || "unknown";
  }

  private isHostAuthBlocked(clientKey: string): boolean {
    const until = this.hostAuthBlockedUntil.get(clientKey) ?? 0;
    return Date.now() < until;
  }

  private async recordHostAuthFailure(clientKey: string, reason: string): Promise<void> {
    const now = Date.now();
    const windowStart = now - RoomDurableObject.HOST_AUTH_WINDOW_MS;
    const list = (this.hostAuthFailures.get(clientKey) ?? []).filter((t) => t >= windowStart);
    list.push(now);
    this.hostAuthFailures.set(clientKey, list);
    if (list.length >= RoomDurableObject.HOST_AUTH_MAX_FAILURES) {
      const until = now + RoomDurableObject.HOST_AUTH_BLOCK_MS;
      this.hostAuthBlockedUntil.set(clientKey, until);
      await this.appendAudit("host_auth_blocked", { clientKey, reason, until: new Date(until).toISOString() });
    }
  }

  private clearHostAuthFailure(clientKey: string): void {
    this.hostAuthFailures.delete(clientKey);
    this.hostAuthBlockedUntil.delete(clientKey);
  }

  private findSlotByParticipantId(room: RoomState, participantId: string): SlotState | null {
    return Object.values(room.slots).find((slot) => slot.participantId === participantId) ?? null;
  }

  private findSlotByNumber(room: RoomState, slotNumber: number): SlotState | null {
    if (!Number.isInteger(slotNumber)) {
      return null;
    }
    return room.slots[slotNumber] ?? null;
  }

  private clearSlot(slot: SlotState): void {
    slot.participantId = null;
    slot.participantResumeTokenHash = null;
    slot.participantName = null;
    slot.connected = false;
    slot.state = "EMPTY";
    slot.draftPreview = null;
    slot.finalImage = null;
    slot.grade = null;
  }

  private async removeParticipantBySlot(room: RoomState, slot: SlotState): Promise<boolean> {
    if (!slot.participantId) {
      return false;
    }
    const participantId = slot.participantId;
    const participantName = slot.participantName;
    const liveChanged = room.liveSlot === slot.slotNumber;

    this.sendToParticipant(participantId, {
      type: "participant:removed",
      roomId: room.roomId,
      slotNumber: slot.slotNumber,
    });

    const sockets = this.playerSockets.get(participantId);
    if (sockets) {
      for (const playerWs of sockets) {
        this.socketMeta.delete(playerWs);
        try {
          playerWs.close(4001, "removed_by_host");
        } catch {}
      }
      this.playerSockets.delete(participantId);
    }

    this.clearSlot(slot);
    if (liveChanged) {
      room.liveSlot = null;
    }
    await this.ctx.storage.put("room", room);
    await this.appendAudit("participant_removed_by_host", {
      roomId: room.roomId,
      slotNumber: slot.slotNumber,
      participantId,
      participantName,
    });

    this.broadcastToHosts({
      type: "slot:status",
      slotNumber: slot.slotNumber,
      participantId: null,
      participantName: null,
      connected: false,
      state: slot.state,
    });
    this.broadcastToHosts({
      type: "slot:preview",
      slotNumber: slot.slotNumber,
      participantId: null,
      preview: null,
    });
    this.broadcastToHosts({
      type: "slot:final",
      slotNumber: slot.slotNumber,
      participantId: null,
      finalImage: null,
    });
    this.broadcastToHosts({
      type: "slot:grade",
      slotNumber: slot.slotNumber,
      participantId: null,
      grade: null,
    });
    if (liveChanged) {
      this.broadcastToHosts({ type: "live:changed", liveSlot: null });
    }
    return true;
  }

  private attachSocketHandlers(ws: WebSocket): void {
    ws.addEventListener("message", (event) => {
      void this.handleSocketMessage(ws, event.data);
    });
    ws.addEventListener("close", () => {
      void this.handleSocketClose(ws);
    });
    ws.addEventListener("error", () => {
      void this.handleSocketClose(ws);
    });
  }

  private async handleSocketClose(ws: WebSocket): Promise<void> {
    const meta = this.socketMeta.get(ws);
    if (!meta) {
      return;
    }

    this.socketMeta.delete(ws);

    if (meta.role === "HOST") {
      this.hostSockets.delete(ws);
      return;
    }

    if (!meta.participantId) {
      return;
    }

    const sockets = this.playerSockets.get(meta.participantId);
    if (sockets) {
      sockets.delete(ws);
      if (sockets.size === 0) {
        this.playerSockets.delete(meta.participantId);
      }
    }

    if (sockets && sockets.size > 0) {
      return;
    }

    const room = await this.loadRoom();
    if (!room) {
      return;
    }
    const slot = this.findSlotByParticipantId(room, meta.participantId);
    if (!slot) {
      return;
    }
    slot.connected = false;
    await this.ctx.storage.put("room", room);
    this.broadcastToHosts({
      type: "slot:status",
      slotNumber: slot.slotNumber,
      participantId: slot.participantId,
      participantName: slot.participantName,
      connected: false,
      state: slot.state,
    });
  }

  private async handleSocketMessage(ws: WebSocket, raw: unknown): Promise<void> {
    const meta = this.socketMeta.get(ws);
    if (!meta) {
      return;
    }
    if (typeof raw !== "string") {
      this.send(ws, { type: "error", error: "invalid_message" });
      ws.close(1003, "invalid_message");
      return;
    }
    const byteLen = new TextEncoder().encode(raw).length;
    if (byteLen > RoomDurableObject.WS_MAX_MESSAGE_BYTES) {
      this.send(ws, { type: "error", error: "message_too_large" });
      ws.close(1009, "message_too_large");
      return;
    }
    const message = parseWsMessage(raw);
    if (!message) {
      this.send(ws, { type: "error", error: "invalid_message" });
      return;
    }

    const room = await this.loadRoom();
    if (!room) {
      this.send(ws, { type: "error", error: "room_not_found" });
      return;
    }

    if (meta.role === "PLAYER") {
      if (!meta.participantId) {
        this.send(ws, { type: "error", error: "participant_not_found" });
        return;
      }
      const slot = this.findSlotByParticipantId(room, meta.participantId);
      if (!slot) {
        this.send(ws, { type: "error", error: "participant_not_in_room" });
        return;
      }

      if (message.type === "preview:update") {
        const payload = message as PreviewUpdateMessage;
        if (typeof payload.preview !== "string" || !payload.preview) {
          this.send(ws, { type: "error", error: "invalid_preview" });
          return;
        }

        slot.draftPreview = payload.preview.slice(0, 1_000_000);
        await this.ctx.storage.put("room", room);
        this.broadcastToHosts({
          type: "slot:preview",
          slotNumber: slot.slotNumber,
          participantId: slot.participantId,
          preview: slot.draftPreview,
        });
        return;
      }

      if (message.type === "stroke:batch") {
        const payload = message as StrokeBatchMessage;
        if (room.liveSlot === slot.slotNumber) {
          this.broadcastToHosts({
            type: "live:stroke",
            slotNumber: slot.slotNumber,
            participantId: slot.participantId,
            strokes: payload.strokes ?? null,
          });
        }
        return;
      }

      if (message.type === "final:submit") {
        const payload = message as FinalSubmitMessage;
        if (room.status !== "OPEN") {
          this.send(ws, { type: "error", error: "room_not_open_for_submit" });
          return;
        }
        if (typeof payload.finalImage !== "string" || !payload.finalImage) {
          this.send(ws, { type: "error", error: "invalid_final_image" });
          return;
        }
        slot.finalImage = payload.finalImage.slice(0, 1_000_000);
        slot.state = "SUBMITTED";
        await this.ctx.storage.put("room", room);
        await this.appendAudit("answer_submitted", {
          roomId: room.roomId,
          slotNumber: slot.slotNumber,
          participantId: slot.participantId ?? "",
        });
        this.broadcastToHosts({
          type: "slot:final",
          slotNumber: slot.slotNumber,
          participantId: slot.participantId,
          finalImage: slot.finalImage,
        });
        this.broadcastToHosts({
          type: "slot:status",
          slotNumber: slot.slotNumber,
          participantId: slot.participantId,
          connected: slot.connected,
          state: slot.state,
        });
        this.sendToParticipant(meta.participantId, { type: "answer:lock", locked: true });
        return;
      }

      this.send(ws, { type: "error", error: "unsupported_message_type" });
      return;
    }

    if (message.type === "live:set") {
      const payload = message as LiveSetMessage;
      if (payload.slotNumber === null) {
        room.liveSlot = null;
      } else if (typeof payload.slotNumber === "number" && room.slots[payload.slotNumber]) {
        room.liveSlot = payload.slotNumber;
      } else {
        this.send(ws, { type: "error", error: "invalid_slot_number" });
        return;
      }
      await this.ctx.storage.put("room", room);
      this.broadcastToHosts({ type: "live:changed", liveSlot: room.liveSlot });
      return;
    }

    if (message.type === "grade:set") {
      const payload = message as GradeSetMessage;
      const slot = this.findSlotByNumber(room, payload.slotNumber);
      if (!slot || !slot.participantId) {
        this.send(ws, { type: "error", error: "invalid_slot_number" });
        return;
      }
      if (slot.state !== "SUBMITTED") {
        this.send(ws, { type: "error", error: "slot_not_submitted" });
        return;
      }
      if (payload.grade !== "O" && payload.grade !== "X") {
        this.send(ws, { type: "error", error: "invalid_grade" });
        return;
      }

      slot.grade = payload.grade;
      await this.ctx.storage.put("room", room);
      await this.appendAudit("answer_graded", {
        roomId: room.roomId,
        slotNumber: slot.slotNumber,
        participantId: slot.participantId,
        grade: slot.grade,
      });
      this.broadcastToHosts({
        type: "slot:grade",
        slotNumber: slot.slotNumber,
        participantId: slot.participantId,
        grade: slot.grade,
      });
      this.sendToParticipant(slot.participantId, {
        type: "answer:grade",
        grade: slot.grade,
      });
      return;
    }

    if (message.type === "resubmit:allow") {
      const payload = message as ResubmitAllowMessage;
      const slot = this.findSlotByNumber(room, payload.slotNumber);
      if (!slot || !slot.participantId) {
        this.send(ws, { type: "error", error: "invalid_slot_number" });
        return;
      }
      if (!slot.finalImage) {
        this.send(ws, { type: "error", error: "slot_has_no_final_image" });
        return;
      }

      slot.state = "JOINED";
      slot.grade = null;
      slot.draftPreview = slot.finalImage;
      await this.ctx.storage.put("room", room);
      await this.appendAudit("resubmit_allowed", {
        roomId: room.roomId,
        slotNumber: slot.slotNumber,
        participantId: slot.participantId,
      });

      this.broadcastToHosts({
        type: "slot:status",
        slotNumber: slot.slotNumber,
        participantId: slot.participantId,
        connected: slot.connected,
        state: slot.state,
      });
      this.broadcastToHosts({
        type: "slot:preview",
        slotNumber: slot.slotNumber,
        participantId: slot.participantId,
        preview: slot.draftPreview,
      });
      this.broadcastToHosts({
        type: "slot:grade",
        slotNumber: slot.slotNumber,
        participantId: slot.participantId,
        grade: null,
      });
      this.sendToParticipant(slot.participantId, {
        type: "answer:resubmit_allowed",
        allowed: true,
        finalImage: slot.finalImage,
      });
      this.sendToParticipant(slot.participantId, { type: "answer:lock", locked: false });
      return;
    }

    if (message.type === "participant:remove") {
      const payload = message as ParticipantRemoveMessage;
      const slot = this.findSlotByNumber(room, payload.slotNumber);
      if (!slot || !slot.participantId) {
        this.send(ws, { type: "error", error: "invalid_slot_number" });
        return;
      }
      await this.removeParticipantBySlot(room, slot);
      return;
    }

    if (
      message.type === "control:open" ||
      message.type === "control:lock" ||
      message.type === "control:next" ||
      message.type === "control:end"
    ) {
      const payload = message as ControlMessage;

      if (payload.type === "control:open") {
        room.status = "OPEN";
        await this.ctx.storage.put("room", room);
        await this.appendAudit("control_open", { roomId: room.roomId });
        this.broadcastRoomStatus(room);
        return;
      }

      if (payload.type === "control:lock") {
        room.status = "LOCKED";
        await this.ctx.storage.put("room", room);
        await this.appendAudit("control_lock", { roomId: room.roomId });
        this.broadcastRoomStatus(room);
        this.broadcastToPlayers({ type: "answer:lock", locked: true });
        return;
      }

      if (payload.type === "control:next") {
        const questionCount = Array.isArray(room.questions) ? room.questions.length : 0;
        const isLastQuestion = questionCount > 0 && room.currentQuestionPos >= questionCount;
        this.upsertQuestionResult(room);
        if (isLastQuestion) {
          room.status = "CLOSED";
          room.liveSlot = null;
          await this.ctx.storage.put("room", room);
          await this.appendAudit("control_end_auto", {
            roomId: room.roomId,
            currentQuestionPos: room.currentQuestionPos,
            questionCount,
          });
          this.broadcastRoomStatus(room);
          this.broadcastToHosts({ type: "live:changed", liveSlot: null });
          this.broadcastToPlayers({ type: "answer:lock", locked: true });
          return;
        }

        room.currentQuestionPos += 1;
        room.status = "OPEN";
        room.liveSlot = null;
        for (const slot of Object.values(room.slots)) {
          slot.draftPreview = null;
          slot.finalImage = null;
          slot.grade = null;
          if (slot.participantId) {
            slot.state = "JOINED";
          } else {
            slot.state = "EMPTY";
          }
        }
        await this.ctx.storage.put("room", room);
        await this.appendAudit("control_next", {
          roomId: room.roomId,
          currentQuestionPos: room.currentQuestionPos,
        });
        this.broadcastRoomStatus(room);
        this.broadcastToHosts({ type: "live:changed", liveSlot: room.liveSlot });
        this.broadcastToHosts({
          type: "question:update",
          currentQuestionPos: room.currentQuestionPos,
          questionText: this.getCurrentQuestionText(room),
        });
        this.broadcastToPlayers({
          type: "question:update",
          currentQuestionPos: room.currentQuestionPos,
          questionText: this.getCurrentQuestionText(room),
        });
        this.broadcastToPlayers({ type: "answer:lock", locked: false });
        return;
      }

      room.status = "CLOSED";
      room.liveSlot = null;
      this.upsertQuestionResult(room);
      await this.ctx.storage.put("room", room);
      await this.appendAudit("control_end", { roomId: room.roomId });
      this.broadcastRoomStatus(room);
      this.broadcastToHosts({ type: "live:changed", liveSlot: null });
      this.broadcastToPlayers({ type: "answer:lock", locked: true });
      return;
    }

    this.send(ws, { type: "error", error: "unsupported_message_type" });
  }

  private async connectHost(request: Request, room: RoomState): Promise<Response> {
    const clientKey = this.getClientKey(request);
    if (this.isHostAuthBlocked(clientKey)) {
      return errorResponse(429, "too_many_auth_attempts");
    }
    const url = new URL(request.url);
    const hostKey = url.searchParams.get("hostKey");
    if (!(await this.verifyHostKey(room, hostKey))) {
      await this.recordHostAuthFailure(clientKey, "ws_host_connect_invalid_host_key");
      return errorResponse(403, "invalid_host_key");
    }
    this.clearHostAuthFailure(clientKey);

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();
    this.hostSockets.add(server);
    this.socketMeta.set(server, { role: "HOST" });
    this.attachSocketHandlers(server);

    this.send(server, {
      type: "room:snapshot",
      room: {
        roomId: room.roomId,
        status: room.status,
        capacity: room.capacity,
        questions: room.questions,
        currentQuestionPos: room.currentQuestionPos,
        currentQuestionText: this.getCurrentQuestionText(room),
        liveSlot: room.liveSlot,
        slots: room.slots,
      },
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  private async verifyHostKey(room: RoomState, hostKey: string | null): Promise<boolean> {
    if (!hostKey) {
      return false;
    }
    const hostKeyHash = await sha256Hex(hostKey);
    return hostKeyHash === room.hostKeyHash;
  }

  private async connectPlayer(request: Request, room: RoomState): Promise<Response> {
    const url = new URL(request.url);
    const participantId = url.searchParams.get("participantId");
    if (!participantId) {
      return errorResponse(401, "missing_participant_id");
    }

    const slot = this.findSlotByParticipantId(room, participantId);
    if (!slot) {
      return errorResponse(403, "invalid_participant_id");
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();

    const sockets = this.playerSockets.get(participantId) ?? new Set<WebSocket>();
    sockets.add(server);
    this.playerSockets.set(participantId, sockets);
    this.socketMeta.set(server, { role: "PLAYER", participantId });
    this.attachSocketHandlers(server);

    slot.connected = true;
    await this.ctx.storage.put("room", room);
    this.broadcastToHosts({
      type: "slot:status",
      slotNumber: slot.slotNumber,
      participantId: slot.participantId,
      participantName: slot.participantName,
      connected: true,
      state: slot.state,
    });

    this.send(server, {
      type: "player:welcome",
      roomId: room.roomId,
      slotNumber: slot.slotNumber,
      status: room.status,
      currentQuestionPos: room.currentQuestionPos,
      questionText: room.status === "CREATED" ? null : this.getCurrentQuestionText(room),
      liveSlot: room.liveSlot,
    });

    if (room.status === "LOCKED" || room.status === "CLOSED") {
      this.send(server, { type: "answer:lock", locked: true });
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/init") {
      let body: { roomId: string; hostKeyHash: string; capacity: number; questions?: string[] };
      try {
        body = (await request.json()) as { roomId: string; hostKeyHash: string; capacity: number; questions?: string[] };
      } catch {
        return errorResponse(400, "invalid_json");
      }

      if (!body.roomId || !body.hostKeyHash || !isValidCapacity(body.capacity)) {
        return errorResponse(400, "invalid_init_payload");
      }

      const existing = await this.ctx.storage.get<RoomState>("room");
      if (existing) {
        return jsonResponse({ ok: true, roomId: existing.roomId });
      }

      const now = Date.now();
      const state: RoomState = {
        roomId: body.roomId,
        hostKeyHash: body.hostKeyHash,
        capacity: body.capacity,
        questions: Array.isArray(body.questions) ? body.questions : [],
        status: "CREATED",
        createdAt: new Date(now).toISOString(),
        expiresAt: new Date(now + ROOM_TTL_MS).toISOString(),
        currentQuestionPos: 1,
        liveSlot: null,
        slots: {},
        questionResults: [],
      };

      for (let i = 1; i <= body.capacity; i++) {
        state.slots[i] = {
          slotNumber: i,
          participantId: null,
          participantResumeTokenHash: null,
          participantName: null,
          connected: false,
          state: "EMPTY",
          draftPreview: null,
          finalImage: null,
          grade: null,
        };
      }

      await this.ctx.storage.put("room", state);
      await this.appendAudit("room_created", {
        roomId: state.roomId,
        capacity: state.capacity,
        expiresAt: state.expiresAt,
      });
      return jsonResponse({ ok: true, roomId: state.roomId }, 201);
    }

    if (request.method === "GET" && url.pathname === "/state") {
      const room = await this.ctx.storage.get<RoomState>("room");
      if (!room) {
        return errorResponse(404, "room_not_found");
      }
      return jsonResponse(room);
    }

    if (request.method === "GET" && url.pathname === "/audit") {
      const room = await this.loadRoom();
      if (!room) {
        return errorResponse(404, "room_not_found");
      }
      const clientKey = this.getClientKey(request);
      if (this.isHostAuthBlocked(clientKey)) {
        return errorResponse(429, "too_many_auth_attempts");
      }
      const hostKey = url.searchParams.get("hostKey");
      const ok = await this.verifyHostKey(room, hostKey);
      if (!ok) {
        await this.recordHostAuthFailure(clientKey, "audit_invalid_host_key");
        return errorResponse(403, "invalid_host_key");
      }
      this.clearHostAuthFailure(clientKey);
      const audit = await this.loadAudit();
      return jsonResponse({ roomId: room.roomId, count: audit.length, events: audit });
    }

    if (request.method === "GET" && url.pathname === "/public-summary") {
      const room = await this.loadRoom();
      if (!room) {
        return errorResponse(404, "room_not_found");
      }
      return jsonResponse(this.buildPublicSummary(room));
    }

    if (request.method === "POST" && url.pathname === "/questions") {
      const room = await this.loadRoom();
      if (!room) {
        return errorResponse(404, "room_not_found");
      }
      const clientKey = this.getClientKey(request);
      if (this.isHostAuthBlocked(clientKey)) {
        return errorResponse(429, "too_many_auth_attempts");
      }
      const hostKey = url.searchParams.get("hostKey");
      if (!(await this.verifyHostKey(room, hostKey))) {
        await this.recordHostAuthFailure(clientKey, "questions_invalid_host_key");
        return errorResponse(403, "invalid_host_key");
      }
      this.clearHostAuthFailure(clientKey);

      let body: { questions?: string[] } = {};
      try {
        body = (await request.json()) as { questions?: string[] };
      } catch {
        return errorResponse(400, "invalid_json");
      }
      if (!Array.isArray(body.questions)) {
        return errorResponse(400, "questions_must_be_array");
      }
      const nextQuestions = body.questions
        .map((q) => (typeof q === "string" ? q.trim().slice(0, 200) : ""))
        .filter((q) => q.length > 0);
      if (nextQuestions.length === 0) {
        return errorResponse(400, "questions_empty");
      }
      if (nextQuestions.length > 200) {
        return errorResponse(400, "questions_too_many");
      }

      room.questions = nextQuestions;
      room.currentQuestionPos = 1;
      room.liveSlot = null;
      room.questionResults = [];
      for (const slot of Object.values(room.slots)) {
        slot.draftPreview = null;
        slot.finalImage = null;
        slot.grade = null;
        if (slot.participantId) {
          slot.state = "JOINED";
        } else {
          slot.state = "EMPTY";
        }
      }
      await this.ctx.storage.put("room", room);
      await this.appendAudit("questions_updated", {
        roomId: room.roomId,
        questionCount: room.questions.length,
      });
      this.broadcastRoomStatus(room);
      this.broadcastToHosts({ type: "live:changed", liveSlot: room.liveSlot });
      this.broadcastToHosts({
        type: "question:update",
        currentQuestionPos: room.currentQuestionPos,
        questionText: this.getCurrentQuestionText(room),
      });
      this.broadcastToPlayers({
        type: "question:update",
        currentQuestionPos: room.currentQuestionPos,
        questionText: this.getCurrentQuestionText(room),
      });
      if (room.status === "OPEN") {
        this.broadcastToPlayers({ type: "answer:lock", locked: false });
      }

      return jsonResponse({
        ok: true,
        roomId: room.roomId,
        currentQuestionPos: room.currentQuestionPos,
        questionText: this.getCurrentQuestionText(room),
        questionCount: room.questions.length,
      });
    }

    if (request.method === "POST" && url.pathname === "/join") {
      let body: JoinRoomRequest = {};
      try {
        body = await parseOptionalJson<JoinRoomRequest>(request);
      } catch {
        return errorResponse(400, "invalid_json");
      }

      const room = await this.ctx.storage.get<RoomState>("room");
      if (!room) {
        return errorResponse(404, "room_not_found");
      }
      if (room.status === "CLOSED") {
        return errorResponse(409, "room_not_open");
      }

      const now = Date.now();
      if (now > new Date(room.expiresAt).getTime()) {
        room.status = "CLOSED";
        await this.ctx.storage.put("room", room);
        return errorResponse(410, "room_expired");
      }

      const participantName = body.participantName?.trim().slice(0, 32) || null;
      const resumeToken = typeof body.resumeToken === "string" ? body.resumeToken.trim().slice(0, 128) : "";
      if (resumeToken) {
        const resumeTokenHash = await sha256Hex(resumeToken);
        const resumeSlot =
          Object.values(room.slots).find((s) => s.participantId && s.participantResumeTokenHash === resumeTokenHash) ?? null;
        if (resumeSlot && resumeSlot.participantId) {
          resumeSlot.connected = true;
          if (participantName !== null) {
            resumeSlot.participantName = participantName;
          }
          await this.ctx.storage.put("room", room);
          await this.appendAudit("participant_resumed", {
            roomId: room.roomId,
            slotNumber: resumeSlot.slotNumber,
            participantId: resumeSlot.participantId,
          });
          return jsonResponse(
            {
              roomId: room.roomId,
              participantId: resumeSlot.participantId,
              slotNumber: resumeSlot.slotNumber,
              status: room.status,
              resumeToken,
              resumed: true,
            },
            201,
          );
        }
      }

      let joinSlot = Object.values(room.slots).find((s) => s.participantId === null) ?? null;
      if (!joinSlot) {
        joinSlot = Object.values(room.slots).find((s) => s.participantId !== null && !s.connected) ?? null;
      }
      if (!joinSlot) {
        return errorResponse(409, "room_full");
      }

      const participantId = randomId("p_", 10);
      const issuedResumeToken = randomId("rt_", 24);
      const replacedParticipantId = joinSlot.participantId;
      joinSlot.participantId = participantId;
      joinSlot.participantResumeTokenHash = await sha256Hex(issuedResumeToken);
      joinSlot.participantName = participantName;
      joinSlot.connected = true;
      joinSlot.state = "JOINED";
      joinSlot.draftPreview = null;
      joinSlot.finalImage = null;
      joinSlot.grade = null;

      await this.ctx.storage.put("room", room);
      await this.appendAudit("participant_joined", {
        roomId: room.roomId,
        slotNumber: joinSlot.slotNumber,
        participantId,
      });
      if (replacedParticipantId) {
        await this.appendAudit("participant_replaced", {
          roomId: room.roomId,
          slotNumber: joinSlot.slotNumber,
          previousParticipantId: replacedParticipantId,
          participantId,
        });
      }

      return jsonResponse(
        {
          roomId: room.roomId,
          participantId,
          slotNumber: joinSlot.slotNumber,
          status: room.status,
          resumeToken: issuedResumeToken,
          resumed: false,
        },
        201,
      );
    }

    if (request.method === "GET" && url.pathname === "/ws/host") {
      if (!isWebSocketUpgrade(request)) {
        return errorResponse(426, "websocket_upgrade_required");
      }
      const room = await this.loadRoom();
      if (!room) {
        return errorResponse(404, "room_not_found");
      }
      return this.connectHost(request, room);
    }

    if (request.method === "GET" && url.pathname === "/ws/player") {
      if (!isWebSocketUpgrade(request)) {
        return errorResponse(426, "websocket_upgrade_required");
      }
      const room = await this.loadRoom();
      if (!room) {
        return errorResponse(404, "room_not_found");
      }
      return this.connectPlayer(request, room);
    }

    if (request.method === "POST" && url.pathname === "/delete") {
      const room = await this.loadRoom();
      if (!room) {
        return errorResponse(404, "room_not_found");
      }
      const clientKey = this.getClientKey(request);
      if (this.isHostAuthBlocked(clientKey)) {
        return errorResponse(429, "too_many_auth_attempts");
      }
      const hostKey = url.searchParams.get("hostKey");
      if (!(await this.verifyHostKey(room, hostKey))) {
        await this.recordHostAuthFailure(clientKey, "delete_invalid_host_key");
        return errorResponse(403, "invalid_host_key");
      }
      this.clearHostAuthFailure(clientKey);

      this.broadcastToHosts({ type: "room:deleted", roomId: room.roomId });
      this.broadcastToPlayers({ type: "room:deleted", roomId: room.roomId });
      await this.appendAudit("room_deleted", { roomId: room.roomId });
      this.closeAllSockets(1000, "room_deleted");
      await this.ctx.storage.deleteAll();
      return jsonResponse({ ok: true, deleted: true, roomId: room.roomId });
    }

    return errorResponse(404, "not_found");
  }
}
