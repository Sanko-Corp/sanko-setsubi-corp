/* =========================================================================
   三交設備株式会社 コーポレートサイト — 共通スクリプト
   - モバイルナビの開閉
   - 採用応募フォームの送信（Google Apps Script エンドポイント）
   ========================================================================= */
(function () {
  'use strict';

  /* ---- 設定 ------------------------------------------------------------
     GASを「ウェブアプリ」としてデプロイして発行されたURLを貼り付ける。
     形式: https://script.google.com/macros/s/XXXXXXXXXX/exec
     設置手順は docs/gas-form-endpoint.gs の冒頭コメントを参照。
     --------------------------------------------------------------------- */
  var GAS_ENDPOINT = 'https://script.google.com/macros/s/AKfycbzXUepMxOt03NON37lbBM7Dkvt49M48tOuvychJhlJOb6r82gvIV7GtP5WFQOfD5T8Y/exec';

  /* ---- モバイルナビ ---------------------------------------------------- */
  function initNavToggle() {
    var toggle = document.querySelector('.nav-toggle');
    var nav = document.getElementById('site-nav');
    if (!toggle || !nav) return;

    var mq = window.matchMedia('(max-width: 900px)');

    function setOpen(open) {
      toggle.setAttribute('aria-expanded', String(open));
      nav.hidden = !open;
    }

    // 初期状態: モバイル幅では閉じる、それ以外は常時表示（hidden解除）
    function sync() {
      if (mq.matches) {
        setOpen(false);
      } else {
        nav.hidden = false;
        toggle.setAttribute('aria-expanded', 'false');
      }
    }

    toggle.addEventListener('click', function () {
      setOpen(nav.hidden);
    });

    // ナビ内リンクをタップしたら閉じる
    nav.addEventListener('click', function (e) {
      if (mq.matches && e.target.closest('a')) setOpen(false);
    });

    mq.addEventListener('change', sync);
    sync();
  }

  /* ---- 採用応募フォーム ------------------------------------------------ */
  function initContactForm() {
    var form = document.getElementById('contact-form');
    if (!form) return;

    var errorEl = document.getElementById('form-error');
    var successEl = document.getElementById('form-success');
    var submitEl = document.getElementById('form-submit');
    var submitLabel = submitEl ? submitEl.textContent : '';
    var loadedAt = Date.now();
    var sending = false;

    function showError(msg) {
      if (!errorEl) return;
      errorEl.textContent = msg;
      errorEl.hidden = false;
    }

    function setSending(on) {
      sending = on;
      if (!submitEl) return;
      submitEl.disabled = on;
      submitEl.textContent = on ? '送信中…' : submitLabel;
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (sending) return;

      var name = (form.elements.name.value || '').trim();
      var email = (form.elements.email.value || '').trim();
      var message = (form.elements.message.value || '').trim();

      if (!name || !email || !message) {
        showError('必須項目（お名前・メール・応募内容）をご入力ください。');
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showError('メールアドレスの形式をご確認ください。');
        return;
      }

      // ボット対策: ハニーポットが埋まっている、または表示から3秒未満での
      // 送信は自動投稿とみなし、成功したように見せて破棄する
      var isBot =
        (form.elements.website && form.elements.website.value) ||
        Date.now() - loadedAt < 3000;
      if (isBot) {
        form.hidden = true;
        if (successEl) successEl.hidden = false;
        return;
      }

      if (errorEl) errorEl.hidden = true;

      if (GAS_ENDPOINT.indexOf('script.google.com') === -1) {
        console.error('[contact] GAS_ENDPOINT が未設定です。assets/js/main.js を確認してください。');
        showError('現在フォームが利用できません。お手数ですが、お電話（06-7509-2714）にてご応募ください。');
        return;
      }

      setSending(true);

      // Content-Type を text/plain にしてプリフライト(OPTIONS)を回避する。
      // GASはOPTIONSに応答できないため、application/json では送信できない。
      fetch(GAS_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          name: name,
          email: email,
          type: form.elements.type ? form.elements.type.value : '',
          message: message,
          userAgent: navigator.userAgent
        })
      })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (!data || !data.ok) throw new Error(data && data.error);
          form.hidden = true;
          if (successEl) successEl.hidden = false;
          window.scrollTo({ top: 0, behavior: 'smooth' });
        })
        .catch(function (err) {
          console.error('[contact] 送信に失敗しました', err);
          setSending(false);
          showError(
            '送信に失敗しました。通信環境をご確認のうえ、もう一度お試しください。' +
            '解決しない場合はお電話（06-7509-2714）にてご応募ください。'
          );
        });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    initNavToggle();
    initContactForm();
  });
})();
