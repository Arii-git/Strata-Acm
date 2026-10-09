# Cut log (time-box: about 3 h total build)

| Item | Why cut | Fallback |
|---|---|---|
| S02 refill-cadence and S03 near-expiry scenarios (A5, A6) | the generator models weekly orders, so the reorder-interval and channel-stock batch models would need another hour | listed as "not planted" on the Evaluation page |
| Replay toggle in the UI (A20) | replay is selected at engine start (`npm run engine:replay`), not toggled in the browser | the mode chip in the top bar shows the mode |
| PostgresStore / pgvector, Redis, Docker | not needed for keyless FileStore | do not claim them; slide 11 should say "file store + sqlite in the prototype" |
| SSE streaming of agent steps | time | plain JSON trace with timestamps; the UI reveals steps in sequence |
| Lead time (weekly backtest) | the engine evaluates at one as-of date; a backtest needs re-running detection at earlier weeks | stated on the Evaluation page as not computed |
| Lighthouse performance run | time | not measured; do not quote a score |
