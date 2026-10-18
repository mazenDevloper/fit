import json, urllib.request, os
def get(u): return urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent':'Mozilla/5.0','Origin':'https://www.365scores.com','Referer':'https://www.365scores.com/'})).read()
os.makedirs('out', exist_ok=True)
d = json.loads(get('https://webws.365scores.com/web/games/current/?appTypeId=5&langId=1&timezoneName=Asia/Muscat&userCountryId=1&sports=1'))
gs = [g for g in d.get('games', []) if g.get('statusGroup') in (3, 4) and (g['homeCompetitor'].get('score', 0) + g['awayCompetitor'].get('score', 0)) > 0]
g = gs[0]
det = json.loads(get('https://webws.365scores.com/web/game/?appTypeId=5&langId=1&timezoneName=Asia/Muscat&userCountryId=1&gameId=%d' % g['id']))
game = det.get('game', {})
out = {'keys': list(game.keys()), 'events': game.get('events', [])[:8], 'members_sample': game.get('members', [])[:3],
       'home': game.get('homeCompetitor', {}).get('id'), 'away': game.get('awayCompetitor', {}).get('id'), 'score': [game.get('homeCompetitor', {}).get('score'), game.get('awayCompetitor', {}).get('score')]}
open('out/game.json', 'w').write(json.dumps(out, indent=1, ensure_ascii=False))
