# Persistent Beijing World Architecture

## State ownership

| Layer | May create | May not create |
| --- | --- | --- |
| World Engine | schedule transitions, physical events, visits, emotional consequences | Telegram wording |
| Ingestion | sourced external facts and provider cache entries | Mira personal experiences |
| Analyzer | SharedKnowledge/OpenLoop/proposal candidates | confirmed plans or visits |
| Ego | reply/share/do-nothing decision and tool/web permission | physical facts |
| Actor | expression grounded in selected IDs and sourced opinions | ungrounded visits, schedule mutations, arbitrary tools |

Existing Inner World records are `realityLayer=inner`; only validated World Engine events may use `physical`.

## Persistent causal chain

```text
external_information / user message / schedule
  -> world_event or open_loop
  -> inner_thought
  -> share_candidate
  -> proactive_log
  -> logical message
  -> message_outbox bubble(s)
  -> Telegram message_id
```

Every stage carries a `correlationId` or a direct `sourceId`. `/api/admin/world/trace` and World Debug use these links; generated prose is not treated as an audit source.

## Tables added by the refactor

- Delivery: `message_outbox`; delivery and lease columns on `messages`.
- Persistent world: `world_states`, `schedule_blocks`, extended `world_events`, `world_characters`, `known_places`, `world_tick_runs`, `proposed_world_mutations`.
- Interaction state: `open_loops`, `shared_knowledge`, `conversation_working_memories`.
- Motivation: `inner_thoughts`, `share_candidates`, `awaiting_replies`.
- External/context: `external_information`, `provider_cache`, `prompt_context_snapshots`.
- Cost: `llm_usage_logs`; extended `internal_journals`.

Indexes isolate by `companionId`; time/status scans have compound indexes. Idempotent work has unique constraints such as `(companionId, windowStart)`, `(companionId, idempotencyKey)` or bubble-level outbox keys.

## World Tick transaction boundary

1. Floor current UTC time to the last completed 15-minute window.
2. Claim `world_tick_runs` with a lease token. A unique constraint rejects a second worker.
3. Perform provider I/O outside the state transaction; cache successes and isolate failures.
4. Load persisted state and schedule, run deterministic pure reducers.
5. Lock/compare the expected world-state version and the current lease token.
6. Commit state, schedule transitions, events, consequences and audit rows together.
7. Mark the tick completed using the same lease token.

The seed is SHA-256 over companion, window, engine version and purpose. A worker with an expired token cannot complete a newer claim. Gaps up to seven days replay schedule boundaries; longer gaps use aggregate decay and do not invent hundreds of routine events.

## Schedule, places and weather

Weekday/weekend templates provide routine. Open loops and recent facts can propose adjustments; a seeded optional block provides bounded variation. Every change records `source`, `changeReason` and `correlationId`.

Google Places results are cached before selected rows are persisted. Deduplication uses provider POI identity first, then normalized name plus coordinates within 150m. Route feasibility checks time, cost, opening state, reservation, weather and the available schedule window. Provider calls are never made inside a database transaction.

QWeather facts are short lived. Rain, snow, thunderstorms, strong wind or alerts can replace a future outdoor block with the nearest feasible indoor known place, but only within 12 hours. The physical weather event, schedule change and audit state change commit together and share an idempotency key.

## Share score and AwaitingReply

Share score:

```text
0.24 emotional intensity
+ 0.22 user relevance
+ 0.15 novelty
+ 0.12 intimacy
+ 0.12 urgency
+ 0.09 event importance
+ 0.06 current share desire
- interruption, irritation and low-trust penalties
```

Default threshold is `0.62`. Quiet hours, user busy, unanswered proactive, daily limit and four-hour interval are hard gates. Candidate claims use database leases, so concurrent hourly workers cannot send one source twice.

AwaitingReply distinguishes ordinary chat, explicit questions, vulnerable disclosure and missed commitments. Busy context extends grace and multiplies negative impact by `0.15`. Each row can create at most one dissatisfaction candidate. An explanation applies only partial recovery; remaining disappointment/irritation decays deterministically over later ticks.

## Actor grounding

The Actor context order is identity, time, current place/activity, schedule, caused emotions, relationship, working memory, open loops, memories, recent world events, selected external/place facts, share candidate, chronological recent messages and the current message. The current message ID is excluded from history.

Actor JSON separates `world`, `external` and `opinion` claims. World claims must reference selected schedule/event/place IDs. Non-null proposed mutations, missing sources, conflicting time claims or invented visits cause one retry; a second failure uses a deterministic grounded fallback. Prompt snapshots contain selected IDs, budget and hashes, never API keys.

## Outbox semantics

A database transaction creates one logical `messages` row and ordered `message_outbox` rows. Passive keys are `reply:<incomingId>:<bubbleIndex>`; proactive keys are `proactive:<candidateId>:<bubbleIndex>`. Delivery leases prevent concurrent drains.

Definite Telegram failures may follow bounded retry policy. A network timeout after request dispatch becomes `delivery_unknown`; later bubbles stop and the row is not auto-retried. Telegram does not expose an idempotency key, so claiming absolute exactly-once delivery would be incorrect.

## Provider failure and cost boundaries

- Google Places: 7-day cache; Google Routes: 30-minute cache.
- QWeather: 30-minute cache; GDELT: 2-hour cache.
- Open-Meteo is the no-key weather fallback. Nominatim and public OSRM are best-effort map fallbacks, serialized to one request per second per instance and cached with the same place/route TTLs.
- Native fetch timeout and one retry for 429/5xx.
- `Promise.allSettled` keeps one failed provider from blocking the world.
- `nvidia/llama-nemotron-embed-vl-1b-v2:free` embeddings request 1024 dimensions and are batched for external-information dedupe.
- `llm_usage_logs` records category, model, tokens, estimated cost, latency and fallback.

Normal 15-minute ticks, emotion decay, schedules and event density use code, not LLM calls.

## Migration and rollback

Migrations are additive. Each new-schema migration has a matching `drizzle/down/*.down.sql` for disposable `mira_test` verification. Production rollback order:

1. Pause world, hourly, daily and outbox cron services.
2. Inspect `delivery_unknown`, then drain safe pending outbox rows.
3. Roll the application back to the previous commit.
4. Keep additive tables until the old application is stable.
5. Only remove new schema after a backup and explicit migration review.

Do not run destructive down SQL against production as the first rollback action.
