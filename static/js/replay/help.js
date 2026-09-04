export const HELP_TOPICS = {
  "video-setup": {
    title: "動画と分析設定",
    html: `
      <p>分析に使う動画と、AIへの前提情報を指定します。</p>
      <ul>
        <li><strong>動画ファイル</strong> — 確認したい作業動画。選ぶと「分析開始」が押せます。</li>
        <li><strong>サンプリング間隔</strong> — 何秒おきに1枚画像を見るか。短いほど細かく見ますが、時間がかかります。</li>
        <li><strong>SOP名</strong> — 今回のチェックの名前（画面上部にも表示されます）。</li>
        <li><strong>動画の前提説明</strong> — 撮影状況や写っているものの説明。AIが状況を理解しやすくなります。</li>
      </ul>
      <p><strong>分析開始</strong> を押すと進捗バーが表示されます。完了すると結果画面に切り替わります。実行中は同じボタンで中断できます。</p>
    `
  },
  "check-items": {
    title: "チェック項目（質問）",
    html: `
      <p>動画の各場面でAIに聞く <strong>確認したいこと</strong> の一覧です。</p>
      <ul>
        <li><strong>ID</strong> — 項目の識別名（短い英数字）。</li>
        <li><strong>質問文</strong> — AIへの質問。「手袋をしているか」など、映像で答えられる内容にします。</li>
        <li><strong>回答値</strong> — 想定する答え（多くは yes / no）。unclear は「判断できない」です。</li>
      </ul>
      <p>「+ 項目を追加」「削除」で項目の編集ができます。デモではシナリオ選択で入った内容のままでも問題ありません。</p>
    `
  },
  "judge-rules": {
    title: "判定ルール",
    html: `
      <p>チェック項目への回答を組み合わせ、<strong>手順が守られているか</strong> を自動判定するルールです。</p>
      <ul>
        <li><strong>イベント</strong> — 「この条件がそろった瞬間」を表します（例: つまみ操作、炎が見える）。</li>
        <li><strong>relations</strong> — イベント同士の関係。順番（before）や同時（overlaps）、禁止（not）を書きます。</li>
        <li><strong>defaults</strong> — 判定の細かい調整（許容時間や、何フレーム続いたら認めるかなど）。</li>
      </ul>
      <p>通常のデモではシナリオに入っている設定をそのまま使えます。詳細編集は上級者向けです。</p>
    `
  },
  "frame-answers": {
    title: "チェック項目の結果",
    html: `
      <p>今表示しているフレームについて、各チェック項目への <strong>AIの回答</strong> です。</p>
      <ul>
        <li><strong>yes</strong> — 「はい・見える・している」</li>
        <li><strong>no</strong> — 「いいえ・見えない・していない」</li>
        <li><strong>unclear</strong> — 画質や角度の都合で判断できない</li>
      </ul>
      <p>フレームを変えると回答も切り替わります。すべて no ばかりのときは警告が出ることがあります。</p>
    `
  },
  "event-detection": {
    title: "イベント検出",
    html: `
      <p>チェック項目の回答から、「手順の各ステップがいつ起きたか」をまとめた一覧です。</p>
      <ul>
        <li>緑のタイムライン — そのイベントが検出された時間帯</li>
        <li>縦線 — 今見ているフレームの位置</li>
        <li>状態表示 — 検出済み / 未検出 / 不要 など</li>
      </ul>
      <p>下の <strong>relations の結果</strong> で、順番・同時・禁止ルールごとの PASS/FAIL を確認できます。</p>
    `
  },
  "relations-check": {
    title: "relations の結果",
    html: `
      <p>SOP が要求する <strong>手順の関係</strong> を1件ずつ Python 判定エンジンが評価した結果です。</p>
      <ul>
        <li><strong>順序 (before)</strong> — 左の出来事が、右より先に起きているか</li>
        <li><strong>同時 (overlaps)</strong> — 検出区間が重なっているか</li>
        <li><strong>禁止 (not)</strong> — 起きてはいけないイベントが検出されていないか</li>
      </ul>
      <p>各カードに <strong>PASS</strong> / <strong>FAIL</strong> と、根拠（時刻や検出状況）が表示されます。上部のサマリーで全体の達成数も確認できます。</p>
    `
  },
  "evidence-region": {
    title: "根拠箇所の表示",
    html: `
      <p>チェック項目が <strong>yes</strong> のとき、AI が「根拠は画像のどこか」を答えられた場合、オレンジの枠で示します。枠の上には項目名（ID）が表示されます。</p>
      <p><strong>仕組み（かんたん）</strong></p>
      <ol>
        <li>まず各フレームで yes / no などの回答を取得します</li>
        <li><strong>yes</strong> になった項目だけ、もう一度 AI に「根拠の場所」を問い合わせます</li>
        <li>場所が取れた項目だけ、動画上にオレンジの枠を表示します</li>
      </ol>
      <ul>
        <li>枠は <strong>今見ているフレーム</strong> について表示します。別の瞬間が yes でも、今のコマでは no なら枠は出ません</li>
        <li>yes でも枠が出ないことがあります。AI が場所を特定できなかった場合です（判定の yes はそのまま有効）</li>
        <li>枠は参考表示です。<strong>PASS/FAIL</strong> の判定には使いません</li>
        <li>枠の位置は目安であり、ずれることがあります</li>
        <li>チェックを外すと枠を隠せます</li>
      </ul>
    `
  }
};

let activeHelpId = null;
const helpBackdrop = document.getElementById("helpBackdrop");
const helpPopover = document.getElementById("helpPopover");
const helpPopoverTitle = document.getElementById("helpPopoverTitle");
const helpPopoverBody = document.getElementById("helpPopoverBody");
const helpPopoverClose = document.getElementById("helpPopoverClose");

export function closeHelp() {
  activeHelpId = null;
  helpBackdrop.classList.remove("visible");
  helpPopover.classList.remove("visible");
  helpBackdrop.hidden = true;
  helpPopover.hidden = true;
}

function positionHelpPopover(anchor) {
  const rect = anchor.getBoundingClientRect();
  const margin = 16;
  const gap = 8;
  helpPopover.style.visibility = "hidden";
  helpPopover.classList.add("visible");
  const popRect = helpPopover.getBoundingClientRect();
  let top = rect.bottom + gap;
  let left = rect.left;
  if (left + popRect.width > window.innerWidth - margin) {
    left = Math.max(margin, window.innerWidth - popRect.width - margin);
  }
  if (top + popRect.height > window.innerHeight - margin) {
    top = Math.max(margin, rect.top - popRect.height - gap);
  }
  helpPopover.style.top = `${top}px`;
  helpPopover.style.left = `${left}px`;
  helpPopover.style.visibility = "visible";
}

function openHelp(topicId, anchor) {
  const topic = HELP_TOPICS[topicId];
  if (!topic) return;
  if (activeHelpId === topicId) {
    closeHelp();
    return;
  }
  activeHelpId = topicId;
  helpPopoverTitle.textContent = topic.title;
  helpPopoverBody.innerHTML = topic.html;
  helpBackdrop.hidden = false;
  helpPopover.hidden = false;
  requestAnimationFrame(() => {
    helpBackdrop.classList.add("visible");
    positionHelpPopover(anchor);
  });
}

export function initHelp() {
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-help]");
    if (btn) {
      e.preventDefault();
      e.stopPropagation();
      openHelp(btn.dataset.help, btn);
      return;
    }
    if (e.target === helpBackdrop) closeHelp();
  });

  helpPopoverClose.addEventListener("click", closeHelp);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && activeHelpId) closeHelp();
  });

  window.addEventListener("resize", () => {
    if (!activeHelpId) return;
    const btn = document.querySelector(`[data-help="${activeHelpId}"]`);
    if (btn) positionHelpPopover(btn);
  });
}
