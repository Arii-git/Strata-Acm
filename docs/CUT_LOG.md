# Cut log (time-box: about 3 h total build)

| Item | Why cut | Fallback |
|---|---|---|
| S02 refill-cadence and S03 near-expiry scenarios (A5, A6) | the generator models weekly orders, so the reorder-interval and channel-stock batch models would need another hour | listed as "not planted" on the Evaluation page |
| S13 stale-feed Lab injector | time | the Data Health Guard code path exists in the engine (feed lag / duplicate ratio suppress signals) but has no UI demo |
| Replay mode (A20) and `npm run snapshot` | time; the engine is deterministic and keyless, so the live demo needs no network or keys | run locally; record a backup video |
| PostgresStore / pgvector, Redis, Docker | not needed for keyless FileStore | do not claim them; slide 11 should say "file store + sqlite in the prototype" |
| SSE streaming of agent steps | time | plain JSON trace with timestamps; the UI reveals steps in sequence |
| Lead time (weekly backtest), IsolationForest corroboration | time | stated on the Evaluation page as not computed |
| Playwright e2e + screenshots, axe, Lighthouse | time | the engine loop e2e is covered by pytest (`tests/engine`) |
| `npm run scale` | time | not claimed |
