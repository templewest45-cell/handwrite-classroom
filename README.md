# handwrite-classroom

Handwrite Classroom System の最小実装です。

## セットアップ

```bash
npm install
```

## ローカル起動

```bash
npm run dev
```

## API スモークテスト

`npm run dev` 起動中に別ターミナルで実行:

```bash
npm run test:api
```

WebSocket フローの統合テスト:

```bash
npm run test:ws
```

まとめて実行:

```bash
npm run test:all
```

型チェック + 全テスト:

```bash
npm run verify
```

## コード構成

- `src/api.ts`: Worker の HTTP ルーティング
- `src/do.ts`: Durable Object の状態管理と WS 処理
- `src/ui.ts`: Host/Player の HTML テンプレート
- `src/ui-host.ts`: Host 画面ロジック
- `src/ui-player.ts`: Player 画面ロジック
- `src/protocol.ts`: WS メッセージ型
- `src/shared.ts`: 共通型・ユーティリティ

## 最小UI

1. `POST /api/rooms` で `roomId` と `hostKey` を取得
2. Host 画面を開く: `/host/:roomId?hostKey=...`
3. Player 画面を開く: `/player/:roomId`
4. Player が Join して描画すると Host にプレビュー表示
5. Host でスロット選択すると `live:set` 送信
6. Host の `Summary Mode` で撮影用表示に切替
7. Host の `Delete Room` でルーム削除

## API

### 1. Health Check

`GET /health`

### 2. ルーム作成

`POST /api/rooms`

```json
{
  "capacity": 4
}
```

### 3. ルーム状態取得

`GET /api/rooms/:roomId`

### 4. 参加

`POST /api/rooms/:roomId/join`

```json
{
  "participantName": "Student A"
}
```

### 5. ルーム削除

`DELETE /api/rooms/:roomId`

```json
{
  "hostKey": "hk_xxxxxxxxxxxxxxxxxxxxxxxx"
}
```

### 6. 監査ログ取得

`GET /api/rooms/:roomId/audit?hostKey=...`

### 7. Host WebSocket

`GET /api/rooms/:roomId/ws/host?hostKey=...`

受信イベント:

- `room:snapshot`
- `room:status`
- `question:update`
- `slot:status`
- `slot:preview`
- `slot:final`
- `slot:grade`
- `live:stroke`
- `live:changed`
- `room:deleted`

送信イベント:

```json
{
  "type": "live:set",
  "slotNumber": 1
}
```

```json
{
  "type": "control:open"
}
```

```json
{
  "type": "control:lock"
}
```

```json
{
  "type": "control:next"
}
```

```json
{
  "type": "control:end"
}
```

```json
{
  "type": "grade:set",
  "slotNumber": 1,
  "grade": "O"
}
```

```json
{
  "type": "resubmit:allow",
  "slotNumber": 1
}
```

### 8. Player WebSocket

`GET /api/rooms/:roomId/ws/player?participantId=...`

送信イベント:

```json
{
  "type": "preview:update",
  "preview": "data:image/webp;base64,..."
}
```

```json
{
  "type": "stroke:batch",
  "strokes": []
}
```

```json
{
  "type": "final:submit",
  "finalImage": "data:image/webp;base64,..."
}
```

受信イベント:

- `answer:lock`
- `answer:grade`
- `answer:resubmit_allowed`
- `room:deleted`

## 仕様メモ

- 容量は `2 / 4 / 6 / 8` のみ
- ルーム TTL は 2 時間
- 参加時に空きスロットへ自動割当
- 永続 DB なし（Durable Objects ストレージのみ）
- 監査ログは DO 内に最新200件を保持
- Host認証（`hostKey`）の失敗はレート制限（5回/5分で10分ブロック）
- WebSocket メッセージ上限は 256KB（超過時は `message_too_large`）

## Operations

- See OPERATIONS.md for classroom E2E checklist and participant resume rules.

