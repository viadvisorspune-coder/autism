# Yoxa connector files

One file per Yoxa connector operation, generated from the implemented routes in
`src/app/api/yoxa/` — not from the workflow's simulated output.

## Before uploading

Replace the placeholder origin with this deployment's real public HTTPS origin:

```bash
sed -i 's|https://orca.example.com|https://YOUR-DEPLOYMENT.vercel.app|' yoxa/openapi/*.yml
```

`servers[0].url` must stay origin-only — scheme and host, no path. The whole
route lives in the `paths` key. Yoxa rejects a server URL containing a path.

## Which tool gets which file

| Yoxa call name | File |
| --- | --- |
| `identity_access_service` | `access-check.openapi.yml` |
| `workflow_state_service` | `workflow-state.openapi.yml` |
| `safety_authority_review_service` | `safety-review.openapi.yml` |
| `audit_provenance_service` | `audit.openapi.yml` |
| `stakeholder_communication_service` (step 13) | `notifications.openapi.yml` |
| `output_artifact_service` | `artifacts.openapi.yml` |
| `tool_47_call` (step 14) | `records-append.openapi.yml` |
| `knowledge_evidence_service` — retrieval, provenance, gaps, goal context, evidence filtering | `records-search.openapi.yml` |
| `knowledge_evidence_service` — memory update (step 14) | `records-append.openapi.yml` |
| `knowledge_evidence_service` — outcome capture (step 13) | `outcomes.openapi.yml` |

No file is needed for the `tool_NN_call` reasoning tools, for the human-approval
tools, or for the generated-output tools. Generated output is delivered through
`artifacts.openapi.yml` via Yoxa's attachment envelope.

## Authentication

Every file declares HTTP Bearer and carries no token. After uploading, enter the
value of `YOXA_CONNECTOR_TOKEN` in Yoxa's connector configuration. It must never
appear in these files, in source, or in a chat message.

## Connection checks

`POST /api/yoxa/artifacts` accepts a check with no files and returns
`received_count: 0`. Every other endpoint validates against a real database row,
so a check needs real `patient_id` and `workflow_run_id` values — seed a test
patient and run rather than inventing UUIDs.

`records/search` and `access/check` return **200 with `decision: "deny"`** when
access is refused. That is a successful call reporting a refusal, not an error.
