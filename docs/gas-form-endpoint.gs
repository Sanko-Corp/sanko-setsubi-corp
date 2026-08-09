/**
 * 三交設備株式会社 採用応募フォーム 受信スクリプト
 *
 * 【設置手順】
 *  1. script.google.com で新規プロジェクトを作成（メール通知のみで使う場合）
 *     スプレッドシートにも記録したい場合は、先にスプレッドシートを作り
 *     「拡張機能」→「Apps Script」から開いたうえで SAVE_TO_SHEET = true にする
 *  2. （省略可）プロジェクト名を「三交設備 採用応募フォーム」などに変更
 *  3. 既存のコードをすべて消し、このファイルの内容を貼り付けて保存
 *  4. 右上「デプロイ」→「新しいデプロイ」
 *       種類  : ウェブアプリ
 *       説明  : 任意
 *       実行者: 自分
 *       アクセス: 全員                 ← ここを必ず「全員」にする
 *  5. 初回は承認を求められるので、アカウントを選び
 *     「詳細」→「（プロジェクト名）に移動」→「許可」
 *  6. 発行された「ウェブアプリのURL」をコピー
 *     （https://script.google.com/macros/s/XXXXXXXX/exec の形式）
 *
 * 【コードを更新したとき】
 *   「デプロイ」→「デプロイを管理」→ 鉛筆アイコン →
 *   バージョンを「新バージョン」にして「デプロイ」
 *   ※「新しいデプロイ」を選ぶとURLが変わってしまうので注意
 */

/* ============================ 設定 ============================ */

/** 通知先メールアドレス（カンマ区切りで複数指定可） */
var NOTIFY_TO = 'sanko_watanabe@maia.eonet.ne.jp';

/**
 * 応募内容をスプレッドシートにも記録するか。
 *
 *   false … メール通知のみ。スプレッドシートは不要（設定も不要）
 *   true  … メールに加えてシートにも1行ずつ記録する
 *
 * false でも応募の取りこぼしは起きないが、メールを削除・誤振り分けすると
 * 応募内容そのものが失われる点に注意。
 */
var SAVE_TO_SHEET = false;

/**
 * SAVE_TO_SHEET = true のときだけ使う、記録先スプレッドシートのID。
 * スプレッドシートのURLの /d/ と /edit の間の文字列。
 *   https://docs.google.com/spreadsheets/d/ここがID/edit
 *
 * スプレッドシートの「拡張機能 → Apps Script」で作成した場合は空欄でも動くが、
 * 紐付けが外れると動かなくなるため、指定しておくことを推奨。
 */
var SPREADSHEET_ID = '';

/** 記録先シート名（存在しなければ自動作成されます） */
var SHEET_NAME = '応募一覧';

/**
 * true にすると、エラー時に原因の詳細をブラウザへ返す（設置作業中のみ推奨）。
 * 運用開始後は false に戻すこと。
 */
var DEBUG = false;

/** 応募者へ自動返信を送るか */
var SEND_AUTO_REPLY = true;

/* ========================== ここまで ========================== */

var HEADERS = ['受信日時', 'お名前', 'メールアドレス', '応募種別', '応募内容', 'User-Agent'];

/**
 * フォームからのPOSTを受け取る。
 * サイト側は Content-Type: text/plain で送信しているため、
 * 本文は e.postData.contents から JSON として読み取る。
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ ok: false, error: 'empty_body' });
    }

    var data = JSON.parse(e.postData.contents);

    // ハニーポット: 人間には見えない項目。埋まっていればボットなので
    // 成功を装って黙って破棄する（ボットに失敗を学習させないため）
    if (data.website) {
      return jsonResponse({ ok: true });
    }

    var name = trim(data.name);
    var email = trim(data.email);
    var type = trim(data.type) || '採用への応募';
    var message = trim(data.message);
    var userAgent = trim(data.userAgent);

    if (!name || !email || !message) {
      return jsonResponse({ ok: false, error: 'missing_required' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonResponse({ ok: false, error: 'invalid_email' });
    }

    // 長すぎる入力は切り詰める（いたずら投稿でシートが壊れるのを防ぐ）
    name = name.slice(0, 100);
    email = email.slice(0, 200);
    message = message.slice(0, 5000);

    var timestamp = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss');

    appendRow([timestamp, name, email, type, message, userAgent.slice(0, 300)]);
    notify(timestamp, name, email, type, message);

    if (SEND_AUTO_REPLY) {
      sendAutoReply(name, email);
    }

    return jsonResponse({ ok: true });

  } catch (err) {
    // 失敗しても応募内容を失わないよう、管理者にだけ通知しておく
    try {
      MailApp.sendEmail(
        NOTIFY_TO,
        '【要確認】採用応募フォームでエラーが発生しました',
        'エラー内容:\n' + err + '\n\n受信データ:\n' +
        (e && e.postData ? e.postData.contents : '(なし)')
      );
    } catch (_) {}

    var res = { ok: false, error: 'server_error' };
    if (DEBUG) res.detail = String(err);
    return jsonResponse(res);
  }
}

/** ブラウザで直接URLを開いたときの動作確認用 */
function doGet() {
  return ContentService
    .createTextOutput('三交設備 採用応募フォーム 受信エンドポイントは正常に稼働しています。')
    .setMimeType(ContentService.MimeType.TEXT);
}

/* --------------------------- 内部処理 --------------------------- */

function trim(v) {
  return v === null || v === undefined ? '' : String(v).trim();
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * 記録先スプレッドシートを取得する。
 * SPREADSHEET_ID が指定されていればそれを開き、未指定なら
 * このスクリプトが紐づくスプレッドシートを使う。
 * 単体プロジェクトとして作成した場合は getActive() が null を返すため、
 * その旨をはっきりエラーにする。
 */
function getSpreadsheet() {
  if (SPREADSHEET_ID) {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error(
      'スプレッドシートに接続できません。このスクリプトはどのスプレッドシートにも' +
      '紐づいていません。SPREADSHEET_ID を設定するか、シート記録が不要であれば ' +
      'SAVE_TO_SHEET = false にしてください。'
    );
  }
  return ss;
}

function appendRow(row) {
  if (!SAVE_TO_SHEET) return;

  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length)
      .setFontWeight('bold')
      .setBackground('#0d2740')
      .setFontColor('#ffffff');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 150);
    sheet.setColumnWidth(5, 400);
  }
  sheet.appendRow(row);
}

function notify(timestamp, name, email, type, message) {
  var subject = '【採用応募】' + name + ' 様より応募がありました';
  var body =
    '三交設備株式会社 採用応募フォームに新しい応募がありました。\n' +
    '------------------------------------------------------------\n' +
    '受信日時　　　: ' + timestamp + '\n' +
    'お名前　　　　: ' + name + '\n' +
    'メールアドレス: ' + email + '\n' +
    '応募種別　　　: ' + type + '\n' +
    '------------------------------------------------------------\n' +
    '【応募内容】\n' + message + '\n' +
    '------------------------------------------------------------\n' +
    'このメールにそのまま返信すると、応募者へ直接返信できます。\n' +
    (SAVE_TO_SHEET
      ? '応募の一覧は、このスクリプトが紐づくスプレッドシートでご確認いただけます。\n'
      : '');

  MailApp.sendEmail({
    to: NOTIFY_TO,
    subject: subject,
    body: body,
    replyTo: email,
    name: '三交設備 採用応募フォーム'
  });
}

function sendAutoReply(name, email) {
  var subject = '【三交設備株式会社】ご応募ありがとうございます';
  var body =
    name + ' 様\n\n' +
    'この度は三交設備株式会社の採用にご応募いただき、誠にありがとうございます。\n' +
    '以下の内容で応募を受け付けいたしました。担当者より改めてご連絡いたしますので、\n' +
    'いましばらくお待ちくださいますようお願い申し上げます。\n\n' +
    '※本メールは自動送信です。このメールへの返信は受け付けておりません。\n' +
    'お急ぎの場合は、下記までお電話ください。\n\n' +
    '------------------------------------------------------------\n' +
    '三交設備株式会社\n' +
    '〒555-0025 大阪市西淀川区姫里1-7-13\n' +
    'TEL 06-7509-2714（受付時間 8:00〜17:00 / 日曜定休）\n' +
    'https://sanko-setsubi-corp.com/\n' +
    '------------------------------------------------------------\n';

  MailApp.sendEmail({
    to: email,
    subject: subject,
    body: body,
    name: '三交設備株式会社'
  });
}

/**
 * 動作テスト用。Apps Scriptエディタでこの関数を選んで実行すると、
 * デプロイしなくても記録とメール送信を確認できる。
 */
function testSubmission() {
  var res = doPost({
    postData: {
      contents: JSON.stringify({
        name: 'テスト太郎',
        email: NOTIFY_TO,
        type: '採用への応募',
        message: 'これは動作確認用のテスト送信です。',
        userAgent: 'manual-test'
      })
    }
  });
  Logger.log(res.getContent());
  Logger.log('本日のメール送信残数: ' + MailApp.getRemainingDailyQuota());
}
