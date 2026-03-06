import test from "node:test";
import assert from "node:assert/strict";

const BASE = process.env.BASE_URL || "http://127.0.0.1:8787";
const WS_BASE = BASE.replace(/^http/, "ws");

function createSocketClient(url) {
  const ws = new WebSocket(url);
  const queued = [];
  const waiters = [];

  ws.addEventListener("message", (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }
    for (let i = 0; i < waiters.length; i++) {
      const w = waiters[i];
      if (w.predicate(msg)) {
        waiters.splice(i, 1);
        w.resolve(msg);
        return;
      }
    }
    queued.push(msg);
  });

  function waitFor(predicate, timeoutMs = 4000) {
    for (let i = 0; i < queued.length; i++) {
      if (predicate(queued[i])) {
        return Promise.resolve(queued.splice(i, 1)[0]);
      }
    }
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const idx = waiters.findIndex((w) => w.resolve === resolve);
        if (idx >= 0) {
          waiters.splice(idx, 1);
        }
        reject(new Error("waitFor timeout"));
      }, timeoutMs);
      waiters.push({
        predicate,
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
      });
    });
  }

  const open = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("websocket open timeout")), 4000);
    ws.addEventListener("open", () => {
      clearTimeout(timeout);
      resolve();
    });
    ws.addEventListener("error", () => {
      clearTimeout(timeout);
      reject(new Error("websocket open error"));
    });
  });

  return { ws, open, waitFor };
}

test("ws flow: preview -> submit -> grade -> resubmit -> delete", async () => {
  if (typeof WebSocket === "undefined") {
    test.skip("WebSocket global is unavailable in this Node runtime");
    return;
  }

  const createRes = await fetch(`${BASE}/api/rooms`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ capacity: 4, questions: ["第1問"] }),
  });
  assert.equal(createRes.status, 201);
  const created = await createRes.json();

  const host = createSocketClient(
    `${WS_BASE}/api/rooms/${created.roomId}/ws/host?hostKey=${encodeURIComponent(created.hostKey)}`,
  );
  await host.open;
  const snapshot = await host.waitFor((m) => m.type === "room:snapshot");
  assert.equal(snapshot.type, "room:snapshot");

  const joinRes = await fetch(`${BASE}/api/rooms/${created.roomId}/join`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ participantName: "WS Flow" }),
  });
  assert.equal(joinRes.status, 201);
  const joined = await joinRes.json();

  const player = createSocketClient(
    `${WS_BASE}/api/rooms/${created.roomId}/ws/player?participantId=${encodeURIComponent(joined.participantId)}`,
  );
  await player.open;
  await player.waitFor((m) => m.type === "player:welcome");

  player.ws.send(
    JSON.stringify({
      type: "preview:update",
      preview: "data:image/webp;base64,AA==",
    }),
  );
  const preview = await host.waitFor((m) => m.type === "slot:preview");
  assert.equal(preview.slotNumber, joined.slotNumber);

  host.ws.send(
    JSON.stringify({
      type: "control:open",
    }),
  );
  await host.waitFor((m) => m.type === "room:status" && m.status === "OPEN");

  player.ws.send(
    JSON.stringify({
      type: "final:submit",
      finalImage: "data:image/webp;base64,AA==",
    }),
  );
  const final = await host.waitFor((m) => m.type === "slot:final");
  assert.equal(final.slotNumber, joined.slotNumber);

  host.ws.send(
    JSON.stringify({
      type: "grade:set",
      slotNumber: joined.slotNumber,
      grade: "O",
    }),
  );
  const graded = await player.waitFor((m) => m.type === "answer:grade");
  assert.equal(graded.grade, "O");

  const summaryRes = await fetch(`${BASE}/api/rooms/${created.roomId}/public-summary`);
  assert.equal(summaryRes.status, 200);
  const summary = await summaryRes.json();
  assert.equal(summary.status, "OPEN");
  assert.equal(summary.totals.submitted, 1);
  assert.equal(summary.totals.graded, 1);
  assert.equal(summary.totals.correct, 1);

  host.ws.send(
    JSON.stringify({
      type: "resubmit:allow",
      slotNumber: joined.slotNumber,
    }),
  );
  const resubmitAllowed = await player.waitFor((m) => m.type === "answer:resubmit_allowed");
  assert.equal(resubmitAllowed.allowed, true);

  host.ws.send(
    JSON.stringify({
      type: "control:next",
    }),
  );
  await host.waitFor((m) => m.type === "room:status" && m.status === "CLOSED");

  const delRes = await fetch(`${BASE}/api/rooms/${created.roomId}`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ hostKey: created.hostKey }),
  });
  assert.equal(delRes.status, 200);

  const getRes = await fetch(`${BASE}/api/rooms/${created.roomId}`);
  assert.equal(getRes.status, 404);

  player.ws.close();
  host.ws.close();
});
