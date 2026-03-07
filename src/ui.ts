import { renderHostScript } from "./ui-host";
import { renderHomeScript } from "./ui-home";
import { renderLobbyScript } from "./ui-lobby";
import { renderPlayerScript } from "./ui-player";
import { renderSummaryScript } from "./ui-summary";

export function renderHomeHtml(): string {
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Handwrite Classroom</title>
  <style>
    :root { --bg:#f8fafc; --line:#cbd5e1; --text:#0f172a; --muted:#475569; --accent:#0f766e; }
    body {
      font-family: "UD デジタル 教科書体 N-R", "BIZ UDPGothic", "Yu Gothic UI", "Meiryo", ui-sans-serif, system-ui, sans-serif;
      font-size:18px;
      margin: 0;
      background:var(--bg);
      color:var(--text);
    }
    main { max-width: 860px; margin: 0 auto; padding: 18px 12px 36px; display:grid; gap:12px; }
    h1 { margin:0 0 4px; }
    h2 { margin:0; }
    p { color:var(--muted); margin:0; }
    .card { background:#fff; border:1px solid var(--line); border-radius:12px; padding:12px; }
    .row { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
    label { font-size:13px; color:#334155; display:grid; gap:4px; }
    input, select, textarea, button { padding:8px 10px; border:1px solid var(--line); border-radius:8px; font:inherit; }
    input[type="file"] { padding:6px; background:#fff; }
    textarea { width:100%; min-height:100px; resize:vertical; }
    button { background:var(--accent); color:#fff; border:none; cursor:pointer; }
    button.secondary { background:#475569; }
    button:disabled { opacity:0.5; cursor:not-allowed; }
    #status { margin-top:8px; font-size:13px; color:#334155; }
    #textStatus { margin-top:6px; font-size:12px; color:#334155; }
    #result { display:none; margin-top:10px; border-top:1px solid var(--line); padding-top:10px; }
    #result a { display:block; color:#0f766e; text-decoration:none; margin-top:6px; word-break:break-all; }
    #result a:hover { text-decoration:underline; }
    ol { margin:8px 0 0; color:#334155; }
  </style>
</head>
<body>
  <main>
    <section class="card">
      <h1>手書きクラスルーム</h1>
      <p>ここからルーム作成して、すぐ授業を開始できます。</p>
    </section>
    <section class="card">
      <h2>1. ルーム作成</h2>
      <div class="row">
        <label>定員
          <select id="capacity">
            <option value="2">2</option>
            <option value="4">4</option>
            <option value="6">6</option>
            <option value="8">8</option>
          </select>
        </label>
      </div>
      <label style="margin-top:8px;">問題テキストファイル（1行1問）
        <input id="textFile" type="file" accept=".txt,text/plain" />
      </label>
      <div class="row" style="margin-top:8px;">
        <button id="textApplyBtn" class="secondary" type="button">テキストファイルをテキスト欄に反映</button>
      </div>
      <div id="textStatus">テキストファイル未選択</div>
      <label style="margin-top:8px;">問題文（1行1問 / 空でもOK）
        <textarea id="questions" placeholder="3+5 はいくつ？&#10;次の漢字を書きなさい: 海"></textarea>
      </label>
      <div class="row" style="margin-top:8px;">
        <button id="createBtn">ルームを作成</button>
      </div>
      <div id="status">未作成</div>
      <div id="result">
        <strong>作成されたURL</strong>
        <a id="hostLink" target="_blank" rel="noreferrer"></a>
        <a id="playerLink" target="_blank" rel="noreferrer"></a>
        <a id="summaryLink" target="_blank" rel="noreferrer"></a>
      </div>
    </section>
    <section class="card">
      <h2>2. 使い方</h2>
      <div class="row" style="margin-top:8px;">
        <a href="/guide" style="text-decoration:none; display:inline-block; background:#475569; color:#fff; border-radius:8px; padding:8px 12px;">詳細な使い方を見る</a>
      </div>
      <ol>
        <li>定員（2 / 4 / 6 / 8）を選ぶ</li>
        <li>問題を入力する（1行1問）。必要ならテキストファイルを読み込み、「テキストファイルをテキスト欄に反映」を押す</li>
        <li>「ルームを作成」を押すと、参加ロビーへ移動する</li>
        <li>参加ロビーの参加URLまたはQRを生徒に配布する</li>
        <li>ロビーの「参加中」一覧で生徒名を確認し、不要な参加者は「削除」で外す</li>
        <li>準備ができたら「解答を開始」を押して教師画面へ進む</li>
        <li>教師画面で採点（○/×/再）し、必要なら「追記」で青色の書き込みを反映する</li>
        <li>最終問題まで終了、またはルーム削除で授業終了。生徒画面は終了メッセージ表示後に自動クローズを試行する</li>
      </ol>
    </section>
  </main>
<script>${renderHomeScript()}</script>
</body>
</html>`;
}

export function renderGuideHtml(): string {
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>詳細な使い方</title>
  <style>
    :root { --bg:#f8fafc; --line:#cbd5e1; --text:#0f172a; --muted:#475569; --accent:#0f766e; }
    body {
      font-family: "UD デジタル 教科書体 N-R", "BIZ UDPGothic", "Yu Gothic UI", "Meiryo", ui-sans-serif, system-ui, sans-serif;
      font-size:18px;
      margin:0;
      background:var(--bg);
      color:var(--text);
    }
    main { max-width:980px; margin:0 auto; padding:18px 12px 36px; display:grid; gap:12px; }
    .card { background:#fff; border:1px solid var(--line); border-radius:12px; padding:12px; }
    .row { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
    .btn { text-decoration:none; display:inline-block; background:#475569; color:#fff; border-radius:8px; padding:8px 12px; }
    h1 { margin:0 0 6px; }
    h2 { margin:0 0 8px; }
    p { margin:0; color:var(--muted); }
    ol { margin:8px 0 0; color:#334155; }
    .shot { width:100%; border:1px solid var(--line); border-radius:10px; background:#fff; margin-top:10px; }
    .caption { margin-top:8px; color:#334155; font-size:15px; }
  </style>
</head>
<body>
  <main>
    <section class="card">
      <h1>詳細な使い方</h1>
      <p>現在の仕様に合わせた操作手順です。</p>
      <div class="row" style="margin-top:8px;">
        <a class="btn" href="/">トップへ戻る</a>
      </div>
    </section>
    <section class="card">
      <h2>1. ルーム準備</h2>
      <ol>
        <li>定員（2 / 4 / 6 / 8）を選ぶ</li>
        <li>問題を1行1問で入力する</li>
        <li>必要ならテキストファイルを反映する</li>
        <li>「ルームを作成」でロビーへ進む</li>
      </ol>
    </section>
    <section class="card">
      <h2>2. ロビー運用</h2>
      <ol>
        <li>参加URLまたはQRを配布する</li>
        <li>参加者名一覧を確認する</li>
      </ol>
      <img class="shot" src="/guide-assets/lobby-initial.png" alt="参加ロビー 初期" />
      <ol>
        <li>誤参加は「削除」で外す</li>
        <li>「解答を開始」で教師画面へ進む</li>
      </ol>
      <img class="shot" src="/guide-assets/lobby-participants.png" alt="参加ロビー 参加者表示" />
    </section>
    <section class="card">
      <h2>3. 教師画面</h2>
      <ol>
        <li>採点行で ○ / × / 再 を使う</li>
        <li>必要なら「追記」で青ペンコメントを反映する</li>
        <li>「生徒の解答を表示」をONにすると、提出画像一覧を確認できる</li>
        <li>公開解答ボードの「次の問題へ」で問題を進める（最終問題は終了遷移）</li>
        <li>授業終了は「終了」または「ルーム削除」</li>
      </ol>
      <img class="shot" src="/guide-assets/host-panel.png" alt="教師画面 採点パネル" />
      <img class="shot" src="/guide-assets/host-annotation.png" alt="教師の追記画面" />
      <img class="shot" src="/guide-assets/host-answers.png" alt="教師画面 生徒解答一覧" />
      <img class="shot" src="/guide-assets/summary-next.png" alt="公開解答ボード 次の問題へ" />
    </section>
    <section class="card">
      <h2>4. 生徒画面の表示</h2>
      <ol>
        <li>名前を入力して「参加」を押すと入室できる</li>
        <li>待機・ロック中: 「しばらくまってね」</li>
        <li>終了時: 終了メッセージと30秒カウントダウン</li>
        <li>30秒後: 自動クローズを試行（不可時は終了画面へ遷移）</li>
      </ol>
      <img class="shot" src="/guide-assets/player-wait.png" alt="生徒画面 待機中" />
      <img class="shot" src="/guide-assets/player-ended.png" alt="生徒画面 授業終了" />
    </section>
  </main>
</body>
</html>`;
}
export function renderHostHtml(roomId: string): string {
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ホスト ${roomId}</title>
  <style>
    :root { --bg:#f7fafc; --card:#fff; --line:#e2e8f0; --text:#1a202c; --accent:#0f766e; }
    body {
      margin:0;
      font-family: "UD デジタル 教科書体 N-R", "BIZ UDPGothic", "Yu Gothic UI", "Meiryo", ui-sans-serif, system-ui, sans-serif;
      font-size:18px;
      background:var(--bg);
      color:var(--text);
    }
    header { background:#fff; border-bottom:1px solid var(--line); padding:12px; position:sticky; top:0; }
    main { padding:12px; display:grid; gap:12px; }
    .row { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
    input, button { padding:8px 10px; border:1px solid var(--line); border-radius:8px; }
    button { background:var(--accent); color:#fff; border:none; cursor:pointer; }
    button.secondary { background:#475569; }
    button.danger { background:#b91c1c; }
    button:disabled { opacity:0.45; cursor:not-allowed; }
    #realtimeBar { background:#fff; border:1px solid var(--line); border-radius:8px; padding:8px; font-size:12px; color:#334155; }
    #slots { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:10px; }
    #judgePanel { background:#fff; border:1px solid var(--line); border-radius:10px; padding:10px; }
    #judgePanel h2 { margin:0 0 8px; font-size:16px; }
    #judgeList { display:grid; gap:8px; }
    .judgeRow { border:1px solid var(--line); border-radius:8px; padding:8px; background:#f8fafc; display:grid; gap:6px; }
    .judgeRow.submitted { background:#dbeafe; border-color:#93c5fd; }
    .judgeRow.correct { background:#fee2e2; border-color:#fca5a5; }
    .judgeHead { display:flex; justify-content:space-between; align-items:center; font-size:13px; }
    .judgeMeta { font-size:12px; color:#475569; }
    .judgeButtons { display:flex; gap:6px; flex-wrap:wrap; }
    .judgeButtons button { min-width:48px; }
    #teacherNotePanel {
      position:fixed; inset:0; z-index:1000; display:none;
      background:rgba(15,23,42,0.85); padding:16px; overflow:auto;
    }
    #teacherNotePanel.open { display:block; }
    #teacherNoteBody { max-width:1080px; margin:0 auto; background:#fff; border:1px solid var(--line); border-radius:12px; padding:12px; }
    #teacherNotePanel h2 { margin:0 0 8px; font-size:16px; }
    #teacherNoteCanvas {
      width:100%; max-width:100%; height:auto;
      border:1px solid var(--line); border-radius:8px; background:#fff; touch-action:none; display:block;
    }
    #teacherNoteMeta { font-size:12px; color:#475569; margin-bottom:8px; }
    .slot { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:8px; cursor:pointer; }
    .slot.disabled { opacity:0.65; cursor:default; }
    .slot.live { outline:2px solid var(--accent); }
    .meta { font-size:12px; color:#4a5568; }
    .meta.livewarn { color:#b45309; font-weight:600; }
    .meta.livedead { color:#b91c1c; font-weight:600; }
    img { width:100%; aspect-ratio:4/3; object-fit:contain; background:#fff; border:1px solid var(--line); border-radius:8px; }
    #log { white-space:pre-wrap; font-size:12px; background:#fff; border:1px solid var(--line); border-radius:8px; padding:8px; min-height:48px; }
    .pill { font-size:12px; border-radius:999px; padding:3px 10px; background:#e2e8f0; color:#1f2937; }
    .pill.ok { background:#dcfce7; color:#14532d; }
    .pill.warn { background:#fee2e2; color:#7f1d1d; }
    #questionNow { background:#fff; border:1px solid var(--line); border-radius:10px; padding:10px; }
    #questionNow h2 { margin:0 0 8px; font-size:16px; }
    #viewOptions { margin-top:8px; display:flex; gap:12px; flex-wrap:wrap; align-items:center; font-size:12px; color:#334155; }
    #viewOptions label { display:flex; gap:6px; align-items:center; font-size:12px; color:#334155; }
    .qline { font-size:14px; color:#1f2937; }
    .qline + .qline { margin-top:4px; }
    .qlabel { color:#64748b; margin-right:6px; }
    #projectorLink { color:#0f766e; text-decoration:none; word-break:break-all; }
    #projectorLink:hover { text-decoration:underline; }
    body.presenter header .control { display:none; }
    body.presenter #log { display:none; }
    body.presenter #judgePanel { display:none; }
    body.presenter #realtimeBar { display:none; }
    body.presenter #slots { display:none; }
  </style>
</head>
<body>
  <header>
    <div class="row">
      <strong>ホストルーム: ${roomId}</strong>
      <input id="hostKey" type="hidden" />
      <button class="control" id="connectBtn">接続</button>
      <button class="control" id="openBtn">開始</button>
      <button class="control secondary" id="showResultBtn">結果を表示</button>
      <button class="control secondary" id="endBtn">終了</button>
      <button class="control secondary" id="clearLiveBtn">LIVE解除</button>
      <button id="summaryBtn" class="secondary" title="Shift+P で切替">管理UIを隠す</button>
      <button class="control danger" id="deleteBtn">ルーム削除</button>
      <span class="pill warn" id="status">未接続</span>
      <span class="pill" id="roomStatus">状態=CREATED / 問題=1</span>
    </div>
  </header>
  <main>
    <section id="questionNow">
      <h2>問題状況</h2>
      <div class="qline"><span class="qlabel">現在:</span><span id="currentQuestionLabel">-</span></div>
      <div class="qline" id="nextQuestionRow"><span class="qlabel">次:</span><span id="nextQuestionLabel">-</span></div>
      <div class="qline"><span class="qlabel">投影:</span><a id="projectorLink" target="_blank" rel="noreferrer">-</a></div>
      <div id="viewOptions">
        <label><input id="showNextQuestionToggle" type="checkbox" /> 次の問題文を表示</label>
        <label><input id="showAnswersToggle" type="checkbox" /> 生徒の解答を表示</label>
        <label><input id="showLogToggle" type="checkbox" /> 管理ログを表示</label>
      </div>
    </section>
    <section id="judgePanel">
      <h2>参加生徒と採点</h2>
      <div id="judgeList"></div>
    </section>
    <section id="teacherNotePanel">
      <div id="teacherNoteBody">
        <h2>教師の追記（青）</h2>
        <div id="teacherNoteMeta">対象: -</div>
        <canvas id="teacherNoteCanvas" width="960" height="640"></canvas>
        <div class="row" style="margin-top:8px;">
          <button id="teacherNoteSaveBtn" class="control">追記を反映</button>
          <button id="teacherNoteResetBtn" class="control secondary">追記をクリア</button>
          <button id="teacherNoteCancelBtn" class="control secondary">閉じる</button>
        </div>
      </div>
    </section>
    <div id="realtimeBar">LIVE: なし / ストローク: 0 / 配信: 待機</div>
    <div id="slots"></div>
    <div id="log"></div>
  </main>
<script>${renderHostScript(roomId)}</script>
</body>
</html>`;
}

export function renderLobbyHtml(roomId: string): string {
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>参加ロビー ${roomId}</title>
  <style>
    :root { --bg:#f8fafc; --line:#cbd5e1; --text:#0f172a; --muted:#475569; --accent:#0f766e; }
    body {
      margin:0;
      font-family: "UD デジタル 教科書体 N-R", "BIZ UDPGothic", "Yu Gothic UI", "Meiryo", ui-sans-serif, system-ui, sans-serif;
      font-size:18px;
      background:var(--bg);
      color:var(--text);
    }
    main { max-width:980px; margin:0 auto; padding:14px; display:grid; gap:12px; }
    .card { background:#fff; border:1px solid var(--line); border-radius:12px; padding:12px; }
    .row { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
    #roomCode { font-size:30px; font-weight:800; letter-spacing:0.08em; }
    #playerQr { width:280px; height:280px; max-width:100%; border:1px solid var(--line); border-radius:10px; background:#fff; }
    #question { font-size:24px; font-weight:700; }
    #status { color:#334155; font-size:13px; }
    .btn { padding:8px 12px; border:none; border-radius:8px; color:#fff; cursor:pointer; font:inherit; }
    .btn.main { background:var(--accent); }
    .btn.sub { background:#475569; }
    .participants { margin-top:8px; display:grid; gap:6px; }
    .participantRow { display:flex; justify-content:space-between; align-items:center; gap:8px; padding:6px 8px; border:1px solid var(--line); border-radius:8px; }
    .participantName { font-size:14px; color:#0f172a; }
    .smallBtn { padding:6px 10px; border:none; border-radius:6px; background:#b91c1c; color:#fff; cursor:pointer; font:inherit; font-size:12px; }
    .smallBtn:disabled { opacity:0.5; cursor:not-allowed; }
    .meta { color:var(--muted); font-size:13px; }
    .publicLink { margin-top:8px; display:grid; gap:4px; }
    a { color:#0f766e; text-decoration:none; word-break:break-all; }
    a:hover { text-decoration:underline; }
  </style>
</head>
<body>
  <main>
    <section class="card">
      <h1>参加ロビー</h1>
      <div class="row" style="margin-bottom:8px;">
        <a class="btn sub" href="/" style="text-decoration:none;">ルーム作成に戻る</a>
      </div>
      <div class="meta">ルームコード</div>
      <div id="roomCode">${roomId}</div>
      <div class="meta">参加中: <span id="joinedCount">0</span> 人</div>
      <div id="participantList" class="participants"></div>
    </section>

    <section class="card">
      <h2>生徒参加用</h2>
      <img id="playerQr" alt="参加QR" />
      <div class="meta" style="margin-top:8px;">参加URL</div>
      <a id="playerUrl" target="_blank" rel="noreferrer"></a>
    </section>

    <section class="card">
      <h2>授業操作</h2>
      <div class="row">
        <button id="startBtn" class="btn main">解答を開始</button>
      </div>
      <div id="status">接続待機</div>
      <div id="question" style="margin-top:10px;">問題: 第1問</div>
      <div class="meta" style="margin-top:8px;">
        詳細管理: <a id="hostUrl" target="_blank" rel="noreferrer">Host画面を開く</a>
      </div>
    </section>
  </main>
<script>${renderLobbyScript(roomId)}</script>
</body>
</html>`;
}

export function renderPlayerHtml(roomId: string): string {
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>プレイヤー ${roomId}</title>
  <style>
    :root { --bg:#fffef8; --line:#d6d3d1; --text:#1c1917; --accent:#0369a1; }
    body {
      margin:0;
      font-family: "UD デジタル 教科書体 N-R", "BIZ UDPGothic", "Yu Gothic UI", "Meiryo", ui-sans-serif, system-ui, sans-serif;
      font-size:18px;
      color:var(--text);
      background:var(--bg);
    }
    header, main { padding:12px; }
    header { border-bottom:1px solid var(--line); position:sticky; top:0; background:var(--bg); }
    .row { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
    input, button, select { padding:8px 10px; border:1px solid var(--line); border-radius:8px; }
    button { background:var(--accent); color:#fff; border:none; cursor:pointer; }
    button.secondary { background:#475569; }
    button.submit-fab {
      position:absolute; right:14px; bottom:14px; z-index:5;
      background:#dc2626; color:#fff; font-weight:700;
      box-shadow:0 6px 16px rgba(0,0,0,0.22);
    }
    button.submit-fab:disabled { background:#94a3b8; }
    button:disabled { opacity:0.45; cursor:not-allowed; }
    .pill { font-size:12px; border-radius:999px; padding:3px 10px; background:#e7e5e4; color:#292524; }
    .pill.warn { background:#fee2e2; color:#7f1d1d; }
    .pill.ok { background:#dcfce7; color:#14532d; }
    .canvas-wrap { position:relative; width:100%; max-width:920px; }
    canvas { width:100%; height:auto; border:1px solid var(--line); border-radius:10px; background:#fff; touch-action:none; display:block; }
    #gradeMark {
      position:absolute; top:10px; right:10px; width:56px; height:56px; display:none;
      align-items:center; justify-content:center; border:3px solid #b91c1c; color:#b91c1c;
      border-radius:999px; background:rgba(255,255,255,0.88); font-size:34px; font-weight:800;
      line-height:1; z-index:4; pointer-events:none;
    }
    #gradeMark.show { display:flex; }
    #lockOverlay {
      position:absolute; inset:0; display:none; align-items:center; justify-content:center;
      border-radius:10px; background:rgba(255,255,255,0.75); color:#44403c; font-weight:700;
      backdrop-filter: blur(1px);
    }
    .canvas-wrap.locked #lockOverlay { display:flex; }
    #status { font-size:12px; color:#57534e; }
    #questionBox, #gradeBanner {
      width:100%; max-width:920px; border-radius:10px; padding:10px 12px;
      background:#fff; border:1px solid var(--line);
    }
    #questionBox { color:#292524; font-weight:600; }
    #gradeBanner { display:none; font-weight:700; }
    #gradeBanner.ok { display:block; background:#dcfce7; color:#14532d; border-color:#86efac; }
    #gradeBanner.ng { display:block; background:#fee2e2; color:#7f1d1d; border-color:#fca5a5; }
  </style>
</head>
<body>
  <header>
    <div class="row">
      <strong>参加ルーム: ${roomId}</strong>
      <label>名前 <input id="name" placeholder="生徒A" /></label>
      <button id="joinBtn">参加</button>
      <label>ツール
        <select id="toolSelect">
          <option value="pen">ペン</option>
          <option value="eraser">消しゴム</option>
        </select>
      </label>
      <label>太さ
        <select id="sizeSelect">
          <option value="2">2</option>
          <option value="3" selected>3</option>
          <option value="6">6</option>
          <option value="10">10</option>
        </select>
      </label>
      <button class="secondary" id="clearBtn">全消去</button>
      <span class="pill warn" id="lockState">ロック中</span>
      <span id="status">未参加</span>
    </div>
  </header>
  <main>
    <div id="questionBox">問題: 第1問</div>
    <div id="gradeBanner"></div>
    <div class="canvas-wrap locked" id="canvasWrap">
      <canvas id="canvas" width="960" height="640"></canvas>
      <button id="submitBtn" class="submit-fab">提出</button>
      <div id="gradeMark">○</div>
      <div id="lockOverlay">ホストがロック中</div>
    </div>
  </main>
<script>${renderPlayerScript(roomId)}</script>
</body>
</html>`;
}

export function renderSummaryHtml(roomId: string): string {
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>公開解答 ${roomId}</title>
  <style>
    :root { --bg:#f8fafc; --line:#cbd5e1; --text:#0f172a; --muted:#475569; }
    body {
      margin:0;
      font-family: "UD デジタル 教科書体 N-R", "BIZ UDPGothic", "Yu Gothic UI", "Meiryo", ui-sans-serif, system-ui, sans-serif;
      font-size:18px;
      color:var(--text);
      background:var(--bg);
    }
    header, main { max-width:1200px; margin:0 auto; padding:12px; }
    header { position:sticky; top:0; background:rgba(248,250,252,0.95); backdrop-filter: blur(2px); border-bottom:1px solid var(--line); }
    h1 { margin:0 0 6px; font-size:24px; }
    h2 { margin:0 0 8px; font-size:18px; }
    .muted { color:var(--muted); font-size:13px; }
    .row { display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-top:8px; }
    .pill { font-size:12px; border-radius:999px; padding:3px 10px; background:#e2e8f0; color:#1e293b; }
    .controlBtn { border:none; border-radius:8px; padding:8px 12px; font:inherit; background:#0f766e; color:#fff; cursor:pointer; }
    .controlBtn:disabled { opacity:0.45; cursor:not-allowed; }
    .card { background:#fff; border:1px solid var(--line); border-radius:12px; padding:12px; margin-top:12px; }
    #stageBadge { font-size:26px; font-weight:800; letter-spacing:0.08em; }
    #resultGrid { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:10px; }
    .metric { border:1px solid var(--line); border-radius:10px; padding:10px; background:#f8fafc; }
    .metricLabel { font-size:12px; color:var(--muted); }
    .metricValue { font-size:22px; font-weight:800; margin-top:4px; }
    #board { display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:10px; }
    .tile { border:1px solid var(--line); border-radius:10px; padding:8px; background:#f8fafc; }
    .tileHead { display:flex; justify-content:space-between; align-items:center; font-size:13px; margin-bottom:6px; }
    .tileName { font-size:12px; color:var(--muted); margin:0 0 6px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .gradeBadge { border-radius:999px; padding:2px 8px; font-size:12px; font-weight:700; background:#e2e8f0; color:#334155; }
    .gradeBadge.ok { background:#dcfce7; color:#166534; }
    .gradeBadge.ng { background:#fee2e2; color:#991b1b; }
    .tileImg { width:100%; aspect-ratio:4/3; object-fit:contain; background:#fff; border:1px solid var(--line); border-radius:8px; }
    .empty { width:100%; aspect-ratio:4/3; display:flex; align-items:center; justify-content:center; background:#fff; border:1px dashed var(--line); border-radius:8px; color:var(--muted); }
    .studentTable { width:100%; border-collapse:collapse; font-size:13px; }
    .studentTable th, .studentTable td { border-bottom:1px solid var(--line); padding:8px; text-align:left; }
    .studentTable th { color:var(--muted); font-weight:600; }
    .questionHistory { display:grid; gap:10px; }
    .qhItem { border:1px solid var(--line); border-radius:10px; padding:8px; background:#f8fafc; }
    .qhTitle { font-size:14px; font-weight:700; margin-bottom:6px; }
    .qhRows { display:grid; gap:6px; }
    .qhRow { display:flex; justify-content:space-between; gap:8px; font-size:13px; }
    .qhAnswerGrid { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:8px; margin-top:6px; }
    .qhAnswer { border:1px solid var(--line); border-radius:8px; background:#fff; padding:6px; display:grid; gap:4px; }
    .qhAnswerHead { font-size:12px; display:flex; justify-content:space-between; }
    .qhAnswer img { width:100%; aspect-ratio:4/3; object-fit:contain; border:1px solid var(--line); border-radius:6px; background:#fff; }
    .qhAnswerEmpty { width:100%; aspect-ratio:4/3; display:flex; align-items:center; justify-content:center; border:1px dashed var(--line); border-radius:6px; color:var(--muted); font-size:12px; }
    .hidden { display:none; }
  </style>
</head>
<body>
  <header>
    <h1 id="pageTitle">公開解答ボード</h1>
    <div class="muted">ルーム: ${roomId}</div>
    <div class="row">
      <span class="pill" id="statusPill">状態: -</span>
      <span class="pill" id="questionPill">問題: -</span>
      <span class="muted" id="updatedAt">更新: -</span>
      <button id="nextFromSummaryBtn" class="controlBtn hidden">次の問題へ</button>
      <span class="muted hidden" id="summaryControlStatus">接続待機</span>
    </div>
  </header>
  <main>
    <section class="card">
      <div id="stageBadge">解答中</div>
      <div class="muted" id="stageSub">各生徒の途中解答を表示しています</div>
    </section>
    <section class="card">
      <h2>結果</h2>
      <div id="resultGrid">
        <div class="metric">
          <div class="metricLabel">正解率</div>
          <div class="metricValue" id="accuracyRate">-</div>
        </div>
        <div class="metric">
          <div class="metricLabel">正解 / 採点済み</div>
          <div class="metricValue" id="correctCount">-</div>
        </div>
        <div class="metric">
          <div class="metricLabel">提出 / 参加</div>
          <div class="metricValue" id="submittedCount">-</div>
        </div>
      </div>
    </section>
    <section class="card" id="boardCard">
      <h2>解答一覧</h2>
      <div id="board">
      </div>
    </section>
    <section class="card hidden" id="finalStudentsCard">
      <h2>生徒ごとの正解率</h2>
      <div id="finalStudents"></div>
    </section>
    <section class="card hidden" id="finalQuestionsCard">
      <h2 id="finalQuestionsTitle">全問題の結果</h2>
      <div id="finalQuestions" class="questionHistory"></div>
    </section>
  </main>
<script>${renderSummaryScript(roomId)}</script>
</body>
</html>`;
}

