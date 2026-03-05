import test from "node:test";
import assert from "node:assert/strict";

const BASE = process.env.BASE_URL || "http://127.0.0.1:8787";

test("room create -> join -> delete", async () => {
  const createRes = await fetch(`${BASE}/api/rooms`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ capacity: 4 }),
  });
  assert.equal(createRes.status, 201);
  const created = await createRes.json();
  assert.ok(created.roomId);
  assert.ok(created.hostKey);

  const joinRes = await fetch(`${BASE}/api/rooms/${created.roomId}/join`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ participantName: "Smoke" }),
  });
  assert.equal(joinRes.status, 201);
  const joined = await joinRes.json();
  assert.equal(joined.roomId, created.roomId);
  assert.ok(joined.participantId);

  const publicRes = await fetch(`${BASE}/api/rooms/${created.roomId}/public-summary`);
  assert.equal(publicRes.status, 200);
  const publicSummary = await publicRes.json();
  assert.equal(publicSummary.roomId, created.roomId);
  assert.ok(Array.isArray(publicSummary.slots));
  assert.ok(typeof publicSummary.totals?.joined === "number");

  const auditRes = await fetch(
    `${BASE}/api/rooms/${created.roomId}/audit?hostKey=${encodeURIComponent(created.hostKey)}`,
  );
  assert.equal(auditRes.status, 200);
  const audit = await auditRes.json();
  assert.ok(audit.count >= 2);
  assert.ok(Array.isArray(audit.events));

  const delRes = await fetch(`${BASE}/api/rooms/${created.roomId}`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ hostKey: created.hostKey }),
  });
  assert.equal(delRes.status, 200);
  const deleted = await delRes.json();
  assert.equal(deleted.deleted, true);

  const getRes = await fetch(`${BASE}/api/rooms/${created.roomId}`);
  assert.equal(getRes.status, 404);
});
