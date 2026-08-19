# ORCA

Autism support coordination. Frontend and backend for a workflow whose AI layer
runs in Yoxa.

## The three layers

| Layer | Where it lives | What it does |
| --- | --- | --- |
| Frontend | `src/app/*` | What a person sees and does |
| Backend | `src/app/api/*`, `src/lib/*`, `src/db/*` | State, permissions, execution, audit |
| AI / agents | **Yoxa** (external) | Understanding, reasoning, generation, adaptive routing |

The layers are connected but not conflated. In particular, no permission
decision is delegated to a model: Yoxa's Safety & Consent agent *assesses* an
action, and `src/lib/access/policy.ts` *decides* it.

## How Yoxa and this app talk

```
Person → this app → (trigger) → Yoxa workflow
                                   ↓
                    Yoxa agents call back into /api/yoxa/*
                                   ↓
                    human approval → /api/yoxa/hitl → this app's UI
                                   ↓
                    person decides → this app → Yoxa resumes
```

### Connector endpoints (Yoxa → this app)

Authenticated with a bearer token (`YOXA_CONNECTOR_TOKEN`), entered in Yoxa's
connector configuration after each OpenAPI file is uploaded.

| Route | Yoxa call name |
| --- | --- |
| `POST /api/yoxa/access/check` | `identity_access_service` |
| `POST /api/yoxa/records/search` | `knowledge_evidence_service` (read) |
| `POST /api/yoxa/records/append` | `knowledge_evidence_service` (write) |
| `POST /api/yoxa/outcomes` | `knowledge_evidence_service` (outcome capture) |
| `POST /api/yoxa/workflow/state` | `workflow_state_service` |
| `POST /api/yoxa/safety/review` | `safety_authority_review_service` |
| `POST /api/yoxa/audit` | `audit_provenance_service` |
| `POST /api/yoxa/notifications` | `stakeholder_communication_service` |
| `POST /api/yoxa/artifacts` | `output_artifact_service` |

The workflow's `tool_NN_call` tools are pure agent reasoning and need no
endpoint here.

`POST /api/yoxa/hitl` is different: it is Yoxa's approval webhook, authenticated
by HMAC over the raw body, not by bearer token.

## Rules the code enforces

- **AI inference is never stored as observed fact.** A record with provenance
  `ai_inferred` is rejected unless it cites an approved memory-update approval.
- **Records are append-only.** A revision inserts a superseding row; prior
  versions survive. There is no update or delete path from the browser.
- **Access is decided before data is read**, and the query is narrowed to the
  permitted categories rather than refused wholesale.
- **A clinician's authority comes from an active care relationship**, never from
  their professional designation.
- **The audit trail has no update or delete path.**
- **Secrets stay server-side.** The browser never holds a Yoxa secret and never
  calls Yoxa directly.

## Setup

```bash
npm install
cp .env.example .env      # fill in; never commit it
npx drizzle-kit push      # or apply drizzle/0000_initial_schema.sql
psql "$DATABASE_URL" -f supabase/migrations/0001_rls.sql
npm run dev
```

Create a private Supabase Storage bucket named `artifacts` before Yoxa delivers
any generated file.

`DATABASE_URL` should be Supabase's **transaction pooler** string (port 6543),
not the direct connection — serverless functions exhaust direct connections.

## Checks

```bash
npm run typecheck
npm test
npm run build
```

## Not done yet

- Screens are built to a low-sensory default (muted palette, no motion,
  generous spacing) pending the real design language.
- `DEPLOYMENT_SECRET_HEADER` in `src/lib/yoxa/trigger.ts` must be confirmed
  against the cURL copied from Yoxa's Release → Integration screen.
- The generated `.openapi.yml` connector files are not written yet.
- This handles personal health-adjacent data. The protections here are
  engineering hygiene, not a compliance review — get one before real data.
