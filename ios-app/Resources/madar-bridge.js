/*
 * Madar bridge — lets the Madar mixed-reality app (mazendevloper.github.io) drive this page
 * with hand gestures when cplay2 is shown inside a Madar window. Inert everywhere else:
 * it only reacts to messages from the Madar origin while the page runs inside a frame.
 * Also registers a service worker so cplay2 keeps opening without internet.
 */
(function () {
  // Runs once per page (cplay3 includes it itself; Madar's iPhone app also injects it into every frame).
  if (window.__madarBridge) return;
  window.__madarBridge = 1;
  var MADAR = 'https://mazendevloper.github.io';

  if ('serviceWorker' in navigator && location.protocol === 'https:' && /cplay/.test(location.host)) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('/cplay2-sw.js').catch(function () {}); });
  }

  if (window.parent === window) return;

  // iOS must never show its own keyboard inside Madar: it fights ARKit/Metal for the screen and the
  // app gets killed. Every field gets inputmode="none" (the original is kept for the number pad),
  // and Madar's keyboard types into it instead.
  function noSysKb(el) {
    if (!el || !el.getAttribute || el.hasAttribute('data-madar-im')) return;
    if (!/^(INPUT|TEXTAREA)$/.test(el.tagName) && !el.isContentEditable) return;
    el.setAttribute('data-madar-im', el.getAttribute('inputmode') || '');
    el.setAttribute('inputmode', 'none');
  }
  document.addEventListener('focusin', function (e) { noSysKb(e.target); }, true);
  document.addEventListener('touchstart', function (e) { noSysKb(e.target && e.target.closest && e.target.closest('input,textarea,[contenteditable]')); }, true);
  // Field Madar's keyboard types into, and where the cursor is inside it.
  var field = null;
  function isText(el) { return el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !/^(button|submit|checkbox|radio|range|color|file|image|reset|hidden)$/i.test(el.type || ''))); }
  // Flutter / canvas apps keep their text field hidden (and iOS won't focus it without a real touch):
  // find it anyway, also inside shadow roots
  function hiddenField() {
    var q = 'flt-text-editing-host input, flt-text-editing-host textarea, input.flt-text-editing, textarea.flt-text-editing';
    var f = document.querySelector(q); if (f) return f;
    var hosts = document.querySelectorAll('flutter-view, flt-glass-pane, [flt-renderer]');
    for (var i = 0; i < hosts.length; i++) { var r = hosts[i].shadowRoot; if (r) { f = r.querySelector(q) || r.querySelector('input,textarea'); if (f) return f; } }
    return null;
  }
  function cur() { var a = document.activeElement; if (isText(a)) return a; if (isText(field) && field.isConnected) return field; var h = hiddenField(); return isText(h) ? h : null; }
  function setVal(el, v, caret) {
    var proto = el.tagName === 'INPUT' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    try { el.setSelectionRange(caret, caret); } catch (e) {}
    el.__mc = caret; report(el);
  }
  function caretOf(el) { var c = el.__mc; if (c == null) { try { c = el.selectionStart; } catch (e) {} } return Math.min(c == null ? el.value.length : c, el.value.length); }
  function report(el) { post({ type: 'field', value: el.value || '', caret: caretOf(el) }); }

  // Inside Madar the page runs twice (one copy per eye) on an iPhone that is also running the camera and 3D.
  // Light mode: no blur/shadow/animation effects (the heaviest work for the iPhone's GPU), and the
  // right-eye copy stays silent so sound and video decoding happen once.
  var EYE = /^madar-eye-(\d)$/.exec(window.name || '');
  if (EYE) {
    var css = '*,*::before,*::after{-webkit-backdrop-filter:none!important;backdrop-filter:none!important;' +
      'box-shadow:none!important;text-shadow:none!important;filter:none!important;' +
      'transition-duration:0s!important;transition-delay:0s!important;animation-duration:0s!important;animation-delay:0s!important;animation-iteration-count:1!important;' +
      'will-change:auto!important}' +
      'img{content-visibility:auto}';
    var addStyle = function () {
      if (document.getElementById('madar-lite')) return;
      var st = document.createElement('style'); st.id = 'madar-lite'; st.textContent = css;
      (document.head || document.documentElement).appendChild(st);
    };
    addStyle(); document.addEventListener('DOMContentLoaded', addStyle);
    document.documentElement.classList.add('madar');
    if (EYE[1] === '1') {
      var play = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () { try { this.muted = true; this.volume = 0; } catch (e) {} return play.apply(this, arguments); };
      setInterval(function () {
        document.querySelectorAll('video,audio').forEach(function (m) { if (!m.muted) { m.muted = true; } });
        document.querySelectorAll('iframe[src*="youtube"]').forEach(function (f) {
          try { f.contentWindow.postMessage('{"event":"command","func":"mute","args":[]}', '*'); } catch (e) {}
        });
      }, 1500);
    }
  }

  function canScroll(el, dx, dy) {
    var s = getComputedStyle(el);
    var y = /(auto|scroll|overlay)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 1;
    var x = /(auto|scroll|overlay)/.test(s.overflowX) && el.scrollWidth > el.clientWidth + 1;
    return (dy && y) || (dx && x);
  }
  function scroller(el, dx, dy) {
    for (var n = el; n && n !== document.documentElement; n = n.parentElement) if (canScroll(n, dx, dy)) return n;
    return document.scrollingElement || document.documentElement;
  }
  function fire(el, type, x, y, Ctor) {
    var opts = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, view: window, button: 0, buttons: type.indexOf('down') > 0 ? 1 : 0, pointerId: 1, pointerType: 'touch', isPrimary: true };
    try { el.dispatchEvent(new (Ctor || MouseEvent)(type, opts)); } catch (e) {}
  }
  var tappedAt = 0;
  // a field the page focuses by itself after a tap (custom widgets, labels over the input): Madar's keyboard too
  document.addEventListener('focusin', function (e) {
    var f = e.target; if (Date.now() - tappedAt > 1200 || !isText(f)) return;
    noSysKb(f); field = f; f.__mc = (f.value || '').length;
    var im = (f.getAttribute('data-madar-im') || '').toLowerCase(), ty = (f.type || '').toLowerCase();
    post({ type: 'field', value: f.value || '', caret: f.__mc });
    post({ type: 'focus', numeric: ty === 'number' || ty === 'tel' || im === 'numeric' || im === 'decimal' || im === 'tel', input: ty });
  }, true);
  function fieldAt(el, x, y) {
    // the tap landed on a label / decoration over a field: find the field under that point
    var lab = el.closest && el.closest('label'); if (lab && lab.control && isText(lab.control)) return lab.control;
    var all = document.querySelectorAll('input,textarea');
    for (var i = 0; i < all.length; i++) { var r = all[i].getBoundingClientRect(); if (isText(all[i]) && x >= r.left - 4 && x <= r.right + 4 && y >= r.top - 4 && y <= r.bottom + 4) return all[i]; }
    return null;
  }
  function tap(x, y) {
    var el = document.elementFromPoint(x, y);
    if (!el) return;
    tappedAt = Date.now();
    // a canvas app (Flutter) makes its hidden text field when one of its fields is tapped: open Madar's keyboard then
    var hfBefore = hiddenField();
    setTimeout(function () {
      var h = hiddenField(); if (!h || h === hfBefore && h.__madarSeen) return;
      h.__madarSeen = 1; noSysKb(h); field = h; h.__mc = (h.value || '').length;
      var ty = (h.type || '').toLowerCase(), im = (h.getAttribute('data-madar-im') || '').toLowerCase();
      post({ type: 'field', value: h.value || '', caret: h.__mc });
      post({ type: 'focus', numeric: ty === 'number' || ty === 'tel' || im === 'numeric' || im === 'decimal' || im === 'tel', input: ty });
    }, 450);
    // a frame inside the page (an embedded player / form): the tap goes into it
    if (el.tagName === 'IFRAME') { try { var r = el.getBoundingClientRect(); el.focus(); el.contentWindow.postMessage({ madar: 1, relay: 1, type: 'tap', x: x - r.left, y: y - r.top }, '*'); } catch (e) {} return; }
    if (!/^(INPUT|TEXTAREA)$/.test(el.tagName) && !el.isContentEditable) { var hit = fieldAt(el, x, y); if (hit) el = hit; }
    fire(el, 'pointerdown', x, y, window.PointerEvent);
    fire(el, 'mousedown', x, y);
    fire(el, 'pointerup', x, y, window.PointerEvent);
    fire(el, 'mouseup', x, y);
    var target = el.closest('a,button,input,select,textarea,[role=button],[role=tab],[onclick],[data-nav-id]') || el;
    if (/^(INPUT|TEXTAREA)$/.test(target.tagName)) noSysKb(target);
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) target.focus();
    // A text field was tapped: Madar opens its keyboard (a number pad for number fields).
    var f = /^(INPUT|TEXTAREA)$/.test(target.tagName) ? target : (target.isContentEditable ? target : null);
    if (f && !/^(button|submit|checkbox|radio|range|color|file|image|reset|hidden)$/i.test(f.type || '')) {
      var im = (f.getAttribute('data-madar-im') || '').toLowerCase(), ty = (f.type || '').toLowerCase();
      if (isText(f)) { field = f; f.__mc = f.value.length; try { f.setSelectionRange(f.__mc, f.__mc); } catch (e) {} }
      post({ type: 'field', value: f.value || '', caret: f.value ? f.value.length : 0 });
      post({ type: 'focus', numeric: ty === 'number' || ty === 'tel' || im === 'numeric' || im === 'decimal' || im === 'tel', input: ty });
    }
    if (typeof target.click === 'function') target.click(); else fire(target, 'click', x, y);
  }
  // Picture of the visible page for Madar's curved screen and 360° view (drawn with html2canvas,
  // loaded only when asked). Only the left-eye copy answers.
  var ME = (function () { try { return new URL(document.currentScript.src).origin; } catch (e) { return location.origin; } })();
  var h2c = null, snapping = false, skipMedia = false;
  function playing() { var v = document.querySelectorAll('video'); for (var i = 0; i < v.length; i++) if (!v[i].paused && v[i].readyState > 2) return true; return !!document.querySelector('iframe[src*="youtube"],iframe[src*="player"],iframe[allowfullscreen]'); }
  function loadH2C() {
    if (window.html2canvas) return Promise.resolve();
    // Inside Madar's iPhone app: the app hands html2canvas to this frame (any website, no server).
    var native = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.madar;
    if (native && !window.__MADAR_PROXY) {
      if (!h2c) h2c = new Promise(function (res, rej) {
        try { native.postMessage({ cmd: 'h2c', data: {} }); } catch (e) {}
        var n = 0, iv = setInterval(function () {
          if (window.html2canvas) { clearInterval(iv); res(); }
          else if (++n > 100) { clearInterval(iv); h2c = null; rej(new Error('html2canvas')); }
        }, 50);
      });
      return h2c;
    }
    if (!h2c) h2c = new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = ME + '/html2canvas.min.js'; s.onload = res; s.onerror = function () { h2c = null; rej(new Error('html2canvas')); };
      (document.head || document.documentElement).appendChild(s);
    });
    return h2c;
  }
  function snap(d) {
    if (snapping) return;
    snapping = true;
    var W = window.innerWidth, H = window.innerHeight;
    loadH2C().then(function () {
      var bg = getComputedStyle(document.body).backgroundColor;
      if (!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') bg = getComputedStyle(document.documentElement).backgroundColor;
      if (!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') bg = '#ffffff';
      return window.html2canvas(document.body, {
        x: window.scrollX, y: window.scrollY, width: W, height: H, windowWidth: W, windowHeight: H,
        scale: 1, logging: false, imageTimeout: 3000, backgroundColor: bg,
        useCORS: false, proxy: window.__MADAR_PROXY ? ME + '/api/madar-browse' : undefined,
        ignoreElements: function (el) { return skipMedia && (el.tagName === 'VIDEO' || el.tagName === 'CANVAS'); },
      });
    }).then(function (c) {
      c.toBlob(function (b) { snapping = false; post({ type: 'snap', id: d.id, blob: b, media: playing() }); }, 'image/jpeg', d.q || 0.8);
    }).catch(function (e) {
      snapping = false;
      // A video from another site can't be copied into the picture: leave videos out and try again.
      if (!skipMedia) { skipMedia = true; setTimeout(function () { snap(d); }, 0); return; }
      post({ type: 'snap', id: d.id, error: String(e && e.message || e) });
    });
  }

  // a frame inside the page talks to Madar (the app's top frame) directly
  var NESTED = (function () { try { return window.parent !== window.top; } catch (e) { return true; } })();
  function post(msg) { msg.madar = 1; if (NESTED) msg.nested = 1; try { (NESTED ? window.top : window.parent).postMessage(msg, MADAR); } catch (e) {} }

  var lastPath = '';
  function where() { return window.__MADAR_PROXY ? window.__MADAR_PROXY.url : location.pathname; }
  setInterval(function () { var w = where(); if (w !== lastPath) { lastPath = w; post({ type: 'path', path: location.pathname, url: window.__MADAR_PROXY ? w : undefined }); } }, 500);

  window.addEventListener('message', function (e) {
    var d = e.data; if (!d || d.madar !== 1) return;
    // from Madar, or relayed by the page around this frame
    if (e.origin !== MADAR && !(d.relay && e.source === window.parent)) return;
    // the field being typed into lives in a frame inside this page: pass the keys on
    var fr = document.activeElement;
    if (fr && fr.tagName === 'IFRAME' && /^(text|key|clear|caret)$/.test(d.type)) { try { d.relay = 1; fr.contentWindow.postMessage(d, '*'); } catch (x) {} return; }
    if (d.type === 'hello') post({ type: 'ready', path: location.pathname, url: window.__MADAR_PROXY ? window.__MADAR_PROXY.url : undefined });
    else if (d.type === 'snap') snap(d);
    else if (d.type === 'media') {
      // play / pause the page's main video (or pass it to the frames inside the page)
      var vs = [].slice.call(document.querySelectorAll('video')).filter(function (v) { var r = v.getBoundingClientRect(); return r.width > 60 && r.height > 40; });
      if (vs.length) { var v = vs.sort(function (a, b) { var ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect(); return rb.width * rb.height - ra.width * ra.height; })[0]; if (v.paused) { var pr = v.play(); if (pr && pr.catch) pr.catch(function () {}); } else v.pause(); }
      else { var fs = document.querySelectorAll('iframe'); for (var i = 0; i < fs.length; i++) try { fs[i].contentWindow.postMessage({ madar: 1, relay: 1, type: 'media', a: d.a }, '*'); } catch (x) {} }
    }
    else if (d.type === 'key') {
      // Keys from a real keyboard: delete, enter (submit), tab (next field).
      var el = cur() || document.activeElement;
      if (d.key === 'Backspace' && isText(el)) {
        var c = caretOf(el), v = el.value || '';
        if (c > 0) setVal(el, v.slice(0, c - 1) + v.slice(c), c - 1);
      } else if (d.key === 'Backspace' && el && el.isContentEditable) document.execCommand('delete');
      else if (d.key === 'Enter' && el) {
        var o = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
        var ok = el.dispatchEvent(new KeyboardEvent('keydown', o));
        el.dispatchEvent(new KeyboardEvent('keyup', o));
        if (ok && el.form) { if (el.form.requestSubmit) el.form.requestSubmit(); else el.form.submit(); }
        else if (el.tagName === 'TEXTAREA' && ok) { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(el, el.value + '\n'); el.dispatchEvent(new Event('input', { bubbles: true })); }
      } else if (d.key === 'Tab') {
        var f = Array.prototype.filter.call(document.querySelectorAll('input,textarea,select,button,a[href]'), function (x) { return x.offsetParent !== null; });
        var i = f.indexOf(el); if (f.length) f[(i + 1) % f.length].focus();
      }
    }
    else if (d.type === 'zoom') { document.documentElement.style.zoom = String(d.value || 1); }
    else if (d.type === 'night') {
      if (!document.getElementById('madar-night')) {
        var st = document.createElement('style'); st.id = 'madar-night';
        st.textContent = 'html.madar-night{filter:invert(.92) hue-rotate(180deg)!important;background:#fff!important}' +
          'html.madar-night img,html.madar-night video,html.madar-night picture,html.madar-night canvas,html.madar-night iframe,html.madar-night [style*="background-image"]{filter:invert(1) hue-rotate(180deg)!important}';
        (document.head || document.documentElement).appendChild(st);
      }
      document.documentElement.classList.toggle('madar-night', !!d.on);
    }
    else if (d.type === 'tap') tap(d.x, d.y);
    else if (d.type === 'scroll') {
      var el = document.elementFromPoint(d.x, d.y) || document.body;
      scroller(el, d.dx, d.dy).scrollBy({ left: d.dx || 0, top: d.dy || 0, behavior: 'auto' });
    }
    else if (d.type === 'nav') {
      var a = document.querySelector('a[href="' + d.path + '"]');
      if (a) a.click(); else location.assign(d.path);
    }
    else if (d.type === 'back') history.back();
    else if (d.type === 'clear') { var el = cur(); if (el) setVal(el, '', 0); else if (document.activeElement && document.activeElement.isContentEditable) document.activeElement.textContent = ''; }
    else if (d.type === 'caret') { var el = cur(); if (el) { var n = Math.max(0, Math.min(el.value.length, d.pos | 0)); el.__mc = n; try { el.setSelectionRange(n, n); } catch (e) {} report(el); } }
    else if (d.type === 'text') {
      // Type into the field at the cursor (works with React-controlled inputs).
      var el = cur() || document.activeElement;
      if (isText(el)) {
        var c = caretOf(el), v = el.value || '';
        setVal(el, v.slice(0, c) + d.value + v.slice(c), c + d.value.length);
      } else if (el && el.isContentEditable) document.execCommand('insertText', false, d.value);
    }
  });
  post({ type: 'ready', path: location.pathname, url: window.__MADAR_PROXY ? window.__MADAR_PROXY.url : undefined });
})();
