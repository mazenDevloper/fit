// Runs in Madar's page before anything else, inside the iPhone app. Gives the page `window.MadarIOS`
// (commands to the app + events from it) and native replacements for browser features iOS limits.
(function () {
  if (window.MadarIOS) return;
  var handler = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.madar;
  function send(cmd, data) { try { handler.postMessage({ cmd: cmd, data: data || {} }); } catch (e) {} }
  var listeners = {};
  window.MadarIOS = {
    version: 1,
    send: send,
    on: function (name, fn) { (listeners[name] = listeners[name] || []).push(fn); },
    last: {},   // newest payload of every event (for code that starts later)
  };
  window.__madarEvent = function (name, p) {
    window.MadarIOS.last[name] = p;
    (listeners[name] || []).forEach(function (f) { try { f(p); } catch (e) { console.error(e); } });
  };

  // Speech: the page's webkitSpeechRecognition code works unchanged, recognised by iOS (Arabic, on device).
  function SR() { this.lang = 'ar-SA'; this.continuous = false; this.interimResults = false; this.maxAlternatives = 1; }
  SR.prototype.start = function () { SR.cur = this; send('speechStart', { lang: this.lang, interim: !!this.interimResults }); };
  SR.prototype.stop = function () { send('speechStop'); };
  SR.prototype.abort = function () { send('speechStop'); };
  window.MadarIOS.on('speech', function (p) {
    var r = SR.cur; if (!r) return;
    if (p.type === 'start') { r.onstart && r.onstart({}); r.onaudiostart && r.onaudiostart({}); }
    else if (p.type === 'result') {
      var alt = { transcript: p.text, confidence: 0.9 }, res = [alt]; res.isFinal = !!p.final; res.item = function (i) { return this[i]; };
      var list = [res]; list.item = function (i) { return this[i]; };
      r.onresult && r.onresult({ results: list, resultIndex: 0 });
    } else if (p.type === 'error') { r.onerror && r.onerror({ error: p.error }); }
    else if (p.type === 'end') { var c = r; SR.cur = null; c.onend && c.onend({}); }
  });
  window.webkitSpeechRecognition = SR;
  window.SpeechRecognition = SR;

  // Files from the photo library arrive in pieces and become a normal File for the page.
  var files = {};
  window.__madarFileBegin = function (id, name, type, size) { files[id] = { name: name, type: type, size: size, parts: [], got: 0 }; };
  window.__madarFileChunk = function (id, b64) {
    var f = files[id]; if (!f) return;
    var bin = atob(b64), a = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    f.parts.push(a); f.got += a.length;
    window.dispatchEvent(new CustomEvent('madar-file-progress', { detail: { name: f.name, got: f.got, size: f.size } }));
  };
  window.__madarFileEnd = function (id) {
    var f = files[id]; delete files[id]; if (!f) return;
    var file = new File(f.parts, f.name, { type: f.type });
    window.dispatchEvent(new CustomEvent('madar-file', { detail: file }));
  };

  var mark = function () { if (document.documentElement) document.documentElement.classList.add('ios-native'); };
  if (document.documentElement) mark(); else document.addEventListener('readystatechange', mark, { once: true });
})();
