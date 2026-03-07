import {
  CreateRoomRequest,
  DeleteRoomRequest,
  Env,
  errorResponse,
  htmlResponse,
  iconResponse,
  isValidCapacity,
  isWebSocketUpgrade,
  JoinRoomRequest,
  jsonResponse,
  parseOptionalJson,
  randomId,
  sha256Hex,
} from "./shared";
import { renderHomeHtml, renderHostHtml, renderLobbyHtml, renderPlayerHtml, renderSummaryHtml } from "./ui";

async function getRoomStub(env: Env, roomId: string): Promise<DurableObjectStub> {
  const id = env.ROOM_DO.idFromName(roomId);
  return env.ROOM_DO.get(id);
}

const api = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "GET" && path === "/") {
      return htmlResponse(renderHomeHtml());
    }
    if (request.method === "GET" && path === "/favicon.ico") {
      return iconResponse();
    }

    const hostPageMatch = path.match(/^\/host\/([^/]+)$/);
    if (request.method === "GET" && hostPageMatch) {
      return htmlResponse(renderHostHtml(hostPageMatch[1]));
    }
    const lobbyPageMatch = path.match(/^\/lobby\/([^/]+)$/);
    if (request.method === "GET" && lobbyPageMatch) {
      return htmlResponse(renderLobbyHtml(lobbyPageMatch[1]));
    }

    const playerPageMatch = path.match(/^\/player\/([^/]+)$/);
    if (request.method === "GET" && playerPageMatch) {
      return htmlResponse(renderPlayerHtml(playerPageMatch[1]));
    }
    const summaryPageMatch = path.match(/^\/summary\/([^/]+)$/);
    if (request.method === "GET" && summaryPageMatch) {
      return htmlResponse(renderSummaryHtml(summaryPageMatch[1]));
    }

    if (request.method === "GET" && path === "/health") {
      return jsonResponse({ ok: true, service: "handwrite-classroom" });
    }

    if (request.method === "POST" && path === "/api/rooms") {
      let body: CreateRoomRequest;
      try {
        body = (await request.json()) as CreateRoomRequest;
      } catch {
        return errorResponse(400, "invalid_json");
      }

      if (!isValidCapacity(body.capacity)) {
        return errorResponse(400, "capacity_must_be_2_4_6_or_8");
      }
      if (body.questions !== undefined) {
        if (!Array.isArray(body.questions)) {
          return errorResponse(400, "questions_must_be_array");
        }
        if (body.questions.length > 200) {
          return errorResponse(400, "questions_too_many");
        }
      }
      const questions =
        body.questions
          ?.map((q) => (typeof q === "string" ? q.trim().slice(0, 200) : ""))
          .filter((q) => q.length > 0) ?? [];

      const roomId = randomId("r_", 8);
      const hostKey = randomId("hk_", 24);
      const hostKeyHash = await sha256Hex(hostKey);
      const stub = await getRoomStub(env, roomId);

      const initResponse = await stub.fetch("https://room.internal/init", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          roomId,
          hostKeyHash,
          capacity: body.capacity,
          questions,
        }),
      });

      if (!initResponse.ok) {
        return errorResponse(500, "room_init_failed");
      }

      return jsonResponse(
        {
          roomId,
          hostKey,
          capacity: body.capacity,
          questionCount: questions.length,
          status: "CREATED",
          joinUrl: `/join/${roomId}`,
        },
        201,
      );
    }

    const roomMatch = path.match(/^\/api\/rooms\/([^/]+)$/);
    if (roomMatch && request.method === "GET") {
      const roomId = roomMatch[1];
      const stub = await getRoomStub(env, roomId);
      const res = await stub.fetch("https://room.internal/state");
      return new Response(res.body, {
        status: res.status,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }

    const joinMatch = path.match(/^\/api\/rooms\/([^/]+)\/join$/);
    if (joinMatch && request.method === "POST") {
      const roomId = joinMatch[1];
      let body: JoinRoomRequest = {};
      try {
        body = await parseOptionalJson<JoinRoomRequest>(request);
      } catch {
        return errorResponse(400, "invalid_json");
      }

      const stub = await getRoomStub(env, roomId);
      const res = await stub.fetch("https://room.internal/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      return new Response(res.body, {
        status: res.status,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }

    const roomDeleteMatch = path.match(/^\/api\/rooms\/([^/]+)$/);
    if (roomDeleteMatch && (request.method === "DELETE" || request.method === "POST")) {
      const roomId = roomDeleteMatch[1];
      let body: DeleteRoomRequest = {};
      try {
        body = await parseOptionalJson<DeleteRoomRequest>(request);
      } catch {
        return errorResponse(400, "invalid_json");
      }
      const hostKey = body.hostKey ?? url.searchParams.get("hostKey") ?? undefined;
      if (!hostKey) {
        return errorResponse(401, "missing_host_key");
      }

      const stub = await getRoomStub(env, roomId);
      const res = await stub.fetch(`https://room.internal/delete?hostKey=${encodeURIComponent(hostKey)}`, {
        method: "POST",
        headers: {
          "x-client-ip": request.headers.get("cf-connecting-ip") || "unknown",
        },
      });
      return new Response(res.body, {
        status: res.status,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }

    const roomAuditMatch = path.match(/^\/api\/rooms\/([^/]+)\/audit$/);
    if (roomAuditMatch && request.method === "GET") {
      const roomId = roomAuditMatch[1];
      const hostKey = url.searchParams.get("hostKey");
      if (!hostKey) {
        return errorResponse(401, "missing_host_key");
      }
      const stub = await getRoomStub(env, roomId);
      const res = await stub.fetch(`https://room.internal/audit?hostKey=${encodeURIComponent(hostKey)}`, {
        method: "GET",
        headers: {
          "x-client-ip": request.headers.get("cf-connecting-ip") || "unknown",
        },
      });
      return new Response(res.body, {
        status: res.status,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }

    const roomQuestionsMatch = path.match(/^\/api\/rooms\/([^/]+)\/questions$/);
    if (roomQuestionsMatch && request.method === "PUT") {
      const roomId = roomQuestionsMatch[1];
      const hostKey = url.searchParams.get("hostKey");
      if (!hostKey) {
        return errorResponse(401, "missing_host_key");
      }
      let body: { questions?: string[] } = {};
      try {
        body = await parseOptionalJson<{ questions?: string[] }>(request);
      } catch {
        return errorResponse(400, "invalid_json");
      }
      if (!Array.isArray(body.questions)) {
        return errorResponse(400, "questions_must_be_array");
      }
      const questions = body.questions
        .map((q) => (typeof q === "string" ? q.trim().slice(0, 200) : ""))
        .filter((q) => q.length > 0);
      if (questions.length === 0) {
        return errorResponse(400, "questions_empty");
      }
      if (questions.length > 200) {
        return errorResponse(400, "questions_too_many");
      }
      const stub = await getRoomStub(env, roomId);
      const res = await stub.fetch(`https://room.internal/questions?hostKey=${encodeURIComponent(hostKey)}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-client-ip": request.headers.get("cf-connecting-ip") || "unknown",
        },
        body: JSON.stringify({ questions }),
      });
      return new Response(res.body, {
        status: res.status,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }

    const roomPublicSummaryMatch = path.match(/^\/api\/rooms\/([^/]+)\/public-summary$/);
    if (roomPublicSummaryMatch && request.method === "GET") {
      const roomId = roomPublicSummaryMatch[1];
      const stub = await getRoomStub(env, roomId);
      const res = await stub.fetch("https://room.internal/public-summary");
      return new Response(res.body, {
        status: res.status,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }

    const wsMatch = path.match(/^\/api\/rooms\/([^/]+)\/ws\/(host|player)$/);
    if (wsMatch && request.method === "GET") {
      if (!isWebSocketUpgrade(request)) {
        return errorResponse(426, "websocket_upgrade_required");
      }
      const roomId = wsMatch[1];
      const role = wsMatch[2];
      const stub = await getRoomStub(env, roomId);
      return stub.fetch(
        new Request(`https://room.internal/ws/${role}${url.search}`, {
          method: "GET",
          headers: request.headers,
        }),
      );
    }

    return errorResponse(404, "not_found");
  },
} satisfies ExportedHandler<Env>;

export default api;
