// «الدخول بحسابي في يوتيوب»: Google sign-in (Google Identity Services, read-only YouTube) - your channels,
// your liked videos, the latest from the channels you follow. The Client ID is not a secret (it only names the app to
// Google); you create it once in Google Cloud and paste it in Madar's settings. The access token lasts about an hour
// and is asked for again quietly when it runs out.
import { settings, saveSettings } from './config.js';

const SCOPE = 'https://www.googleapis.com/auth/youtube.readonly';
const KEY = 'madar.gtoken';
const API = 'https://www.googleapis.com/youtube/v3/';
let tok = null; try { tok = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch {}
let client = null, gis = null;

export const clientId = () => (settings.googleClientId || '').trim();
export const signedIn = () => !!(tok && tok.exp > Date.now() + 60e3);
export const account = () => tok?.name || '';

function loadGis() {
  if (gis) return gis;
  gis = new Promise((ok, no) => {
    if (window.google?.accounts?.oauth2) return ok();
    const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
    s.onload = () => ok(); s.onerror = () => { gis = null; no(new Error('تعذّر تحميل تسجيل الدخول من Google')); };
    document.head.appendChild(s);
  });
  return gis;
}
// call from a real tap (Google opens its own small window)
export async function signIn(quiet = false) {
  if (!clientId()) throw new Error('أضف Google Client ID في إعدادات مدار أولاً');
  await loadGis();
  return new Promise((ok, no) => {
    client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId(), scope: SCOPE,
      callback: async r => {
        if (r.error) return no(new Error(r.error_description || r.error));
        tok = { t: r.access_token, exp: Date.now() + (r.expires_in || 3600) * 1000 };
        try { const me = await api('channels', { part: 'snippet', mine: true }); tok.name = me.items?.[0]?.snippet?.title || ''; tok.pic = me.items?.[0]?.snippet?.thumbnails?.default?.url || ''; } catch {}
        try { localStorage.setItem(KEY, JSON.stringify(tok)); } catch {}
        saveSettings({ googleSignedIn: true }); ok(tok);
      },
      error_callback: e => no(new Error(e?.message || 'أُلغي تسجيل الدخول')),
    });
    client.requestAccessToken({ prompt: quiet ? '' : 'consent' });
  });
}
export function signOut() { try { if (tok?.t) window.google?.accounts?.oauth2?.revoke(tok.t, () => {}); } catch {} tok = null; try { localStorage.removeItem(KEY); } catch {} saveSettings({ googleSignedIn: false }); }

export async function api(path, params = {}) {
  if (!signedIn()) throw new Error('signin');
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '').map(([k, v]) => [k, String(v)]));
  const r = await fetch(API + path + '?' + q, { headers: { Authorization: 'Bearer ' + tok.t } });
  if (r.status === 401) { tok = null; try { localStorage.removeItem(KEY); } catch {} throw new Error('signin'); }
  if (!r.ok) throw new Error('YouTube ' + r.status);
  return r.json();
}
const vid = it => ({ id: it.contentDetails?.videoId || it.snippet?.resourceId?.videoId || (typeof it.id === 'string' ? it.id : it.id?.videoId), title: it.snippet?.title || '', channel: it.snippet?.videoOwnerChannelTitle || it.snippet?.channelTitle || '', thumb: it.snippet?.thumbnails?.medium?.url || it.snippet?.thumbnails?.default?.url || '' });
export async function myChannels() {
  const r = await api('subscriptions', { part: 'snippet', mine: true, maxResults: 50, order: 'relevance' });
  return (r.items || []).map(s => ({ id: s.snippet.resourceId.channelId, name: s.snippet.title, pic: s.snippet.thumbnails?.default?.url || '' }));
}
export async function channelVideos(id) { const r = await api('playlistItems', { part: 'snippet,contentDetails', playlistId: 'UU' + id.slice(2), maxResults: 20 }); return (r.items || []).map(vid).filter(v => v.id && v.title !== 'Private video'); }
export async function liked() { const r = await api('videos', { part: 'snippet', myRating: 'like', maxResults: 25 }); return (r.items || []).map(vid); }
export async function popular() { const r = await api('videos', { part: 'snippet', chart: 'mostPopular', regionCode: 'OM', maxResults: 20 }); return (r.items || []).map(vid); }
export async function videoInfo(id) { const r = await api('videos', { part: 'snippet', id }); return r.items?.[0] ? vid(r.items[0]) : null; }
export async function search(q, n = 15) { const r = await api('search', { part: 'snippet', type: 'video', q, maxResults: n }); return (r.items || []).map(vid).filter(v => v.id); }
