# DECK_DELTAS — what the system computes vs what the deck shows (update the slides, not the code)

All values are computed by the engine from seed A (`seed_dev`, 20261009) at SIM_NOW 2026-10-09 09:00 IST; `npm run eval` recomputes them. Hold-out (seed B, 20261010) is shown for reference only, and nothing was tuned on it.

| Deck item (slide) | Deck value | Computed seed A | Seed B | Within tolerance? | Action |
|---|---|---|---|---|---|
| Orders delta #4821 (7) | −31% | −31.3% | −29.5% | yes (±0.08) | keep |
| Complaints delta, count (7) | +47% | +48.0% | +46.7% | yes | keep |
| Response time delta (7) | +22% | +22.1% | +26.1% | yes | keep |
| Interaction delta (7) | −40% | −39.5% | −41.0% | yes | keep |
| Risk score #4821 (7) | 91 | 98 | — | no test asserts it | change slide to the live number or say "~98 in the prototype" |
| Memory similarity INC-017 (8) | 89% | 0.603 (0.5 × TF-IDF 0.296 + 0.3 × cause 1.0 + 0.2 × pattern 0.778) | — | no (target 0.89 ± 0.05) | change slide: "top match INC-017, similarity 0.60 (TF-IDF keyless)". With an embeddings API the cosine term would change; not measured |
| "4 signals, 4 systems" (7) | 4 systems | 4 systems (orders, support, crm, inventory) | 4 | yes | reword: inventory comes from the SKU stock-cover / ETA-slip evidence |
| Likely cause (7/8) | "service deterioration" / supplier delay | supplier_delay (confidence 0.79, keyless) | supplier_delay | — | slide 7: call service deterioration the symptom, not the cause |
| Business Health (12) | 84 | 82.0 (Δ4w −2.3) | — | not asserted | change slide to 82 or "live value" |
| "8 emerging risks" (12) | 8 | 7 risk incidents + 1 opportunity (8 incidents) | 8 | — | reword to "7 risks + 1 opportunity" |
| "3 high priority" (12) | 3 | 4 high/critical (1 critical, 3 high incl. 2 QA-routed) | — | — | reword |
| Detection-to-Action (14/15) | 4 min / < 1 min | measured live from audit wall-clock; n depends on clicks | — | — | show the live Time-to-Action page; manual 15 min stays "illustrative" |

Evaluation (Evaluation page): seed A recall 7/8 planted, precision 0.875, root-cause accuracy 1.0 on detected, 1 false alarm. Hold-out B recall 7/8, precision 0.875, root-cause accuracy 1.0, and misses: S09 not detected; decoy S12 flagged as an opportunity (a false alarm). S02/S03 are not planted in this build.
