# Handwrite Classroom Operational Checklist

## Scope
- Goal 1: Fix and run a classroom E2E flow checklist before operation.
- Goal 2: Document and align the participant resume rule.

## Environment
- Start URL: `http://127.0.0.1:8787/`
- Recommended run command: `npm run dev -- --port 8787`

## 1) E2E Classroom Flow Checklist
1. Open `http://127.0.0.1:8787/`. - ASSUMED PASS (未実施)
2. Create a room with capacity `4` and at least `2` questions. - ASSUMED PASS (未実施)
3. Confirm you are redirected to `/lobby/:roomId?hostKey=...`. - ASSUMED PASS (未実施)
4. Open Player URL from QR on one student device/tab and join as `Student A`. - ASSUMED PASS (未実施)
5. Open Player URL from another student device/tab and join as `Student B`. - ASSUMED PASS (未実施)
6. In lobby, confirm joined count increments correctly. - ASSUMED PASS (未実施)
7. Click `隗｣遲斐ｒ髢句ｧ義 in lobby. - ASSUMED PASS (未実施)
8. Confirm redirect to `/host/:roomId?hostKey=...` and host auto-connects (status connected). - ASSUMED PASS (未実施)
9. On each player, confirm pre-start text was `髢句ｧ句ｾ・■` and after start the question appears. - ASSUMED PASS (未実施)
10. Submit one answer from `Student A`. - ASSUMED PASS (未実施)
11. On host, confirm slot preview/final update appears for `Student A`. - ASSUMED PASS (未実施)
12. Grade `Student A` as `O` and confirm player gets grade feedback. - ASSUMED PASS (未実施)
13. Click `谺｡縺ｮ蝠城｡形 from host. - ASSUMED PASS (未実施)
14. Confirm players switch to next question and can write again. - ASSUMED PASS (未実施)
15. Click `邨ゆｺ・ from host and confirm players become locked. - ASSUMED PASS (未実施)
16. Delete room from host and confirm all clients receive room deleted state. - ASSUMED PASS (未実施)

## 1) Pass Criteria
- No unrecoverable errors in browser console.
- Host starts from lobby and auto-connects after start.
- Students do not see question text before start (`髢句ｧ句ｾ・■` only).
- Question progression (`谺｡縺ｮ蝠城｡形) updates both host and player views.
- Delete operation closes session cleanly.

## 2) Participant Resume Rule (Operational)
- Resume is supported only on the same device and same browser profile.
- Player gets a local resume token on first join and reuses it for rejoin.
- Rejoin with the same token returns the same `participantId` and same slot.
- Rejoin without token is treated as new join (new participant/slot).
- If a student changes device/browser, treat it as new join.

## 2) Teacher Guidance Text (Use As-Is)
- "騾壻ｿ｡縺悟・繧後◆繧峨∝酔縺倡ｫｯ譛ｫ縺ｧ蜷後§蜿ょ刈QR繧貞・蠎ｦ髢九＞縺ｦ蜿ょ刈縺励※縺上□縺輔＞縲ょ・縺ｮ蟶ｭ縺ｫ謌ｻ繧後∪縺吶・
- "遶ｯ譛ｫ繧貞､峨∴縺溷ｴ蜷医・譁ｰ隕丞盾蜉謇ｱ縺・↓縺ｪ繧翫∪縺吶・

## Quick Recovery Procedure
1. Student reports disconnection.
2. Ask student to reopen the room QR on the same device/browser.
3. Press `蜿ょ刈` again.
4. Teacher confirms same slot is back online on host screen.

## Execution Record
### 2026-03-05
- Scope: local operational dry-run on `http://127.0.0.1:8787/`
- Automated checks:
- `npm run verify` passed (`check`, `test:api`, `test:ws` all green).
- Resume behavior check passed:
- same participant after resume token rejoin: `true`
- same slot after resume token rejoin: `true`
- resumed flag on rejoin response: `true`
- Manual checklist status:
- Not yet executed on real teacher/student devices for UI-level steps (QR scanning, lobby count visuals, start-to-host redirect observation).
- Next action: run the full `E2E Classroom Flow Checklist` with actual devices/tabs and mark pass/fail per step.
