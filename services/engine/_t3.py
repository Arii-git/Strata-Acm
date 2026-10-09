from fastapi.testclient import TestClient
from strata_engine.app import app
import json
c=TestClient(app)
print(c.get('/health').json())
b=c.get('/briefing').json(); print(b['summary']); print([ (p['ref'],p['severity']) for p in b['priorities']], len(b['held_back']))
print(c.get('/portfolio/health').json()['index'], [ (p['key'],p['value'],p['delta_4w']) for p in c.get('/portfolio/health').json()['pillars']])
r=c.post('/incidents/INC-2026-0001/investigate').json()
print(r['cause'], r['cause_confidence'], r['grounding_ok'], r['grounding_notes'])
for m in r['memory_matches'][:3]: print(m['ref'], m['similarity'], m['breakdown'])
for s in r['narrative']: print(' -', s['text'], s['evidence_ids'])
d=c.get('/incidents/INC-2026-0001').json(); p=d['plan']; print(p['id'], p['requires_role'], p['four_eyes'], [s['action'] for s in p['steps']])
print(c.post(f"/plans/{p['id']}/decision", json={'decision':'rejected','persona':'operations_manager','decided_by':'x'}).status_code)
print(c.post(f"/plans/{p['id']}/decision", json={'decision':'approved','persona':'operations_manager','decided_by':'Arihant'}).json())
print(c.post('/lab/advance', json={'days':14}).json())
for ref in ['INC-2026-0005','INC-2026-0006']:
    r=c.post(f'/incidents/{ref}/investigate').json(); print(ref, r['cause'], r['grounding_ok'], r['narrative'][-1]['text'][:80])
print(c.get('/audit/verify').json(), c.get('/time-to-action').json()['items'])
a=c.get('/accounts/4821').json(); print(a['next_best_actions'])
print(c.get('/accounts/4890').json()['next_best_actions'])
print(c.post('/ask', json={'question':'Where are we quietly losing money?'}).json()['cards'][0]['title'])
c.post('/lab/reset')
