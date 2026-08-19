# autism

## Skills

### `deployment-helper` — Yoxa Deployment Helper

Located at `.claude/skills/deployment-helper/`. Guides a participant from a
sandboxed Yoxa workflow to code-backed API connectors, a server-side trigger
integration, and deployed human approvals.

- `SKILL.md` — entry point: routing, non-negotiable rules, release-stage gates.
- `agents/openai.yaml` — interface metadata for non-Claude agent hosts.
- `references/` — stage guides loaded on demand:
  - `workflow-context.md` — reading pasted Yoxa workflow context.
  - `api-configuration.md` — generating and uploading connector OpenAPI files.
  - `yoxa-openapi-profile.md` — the canonical Yoxa-compatible OpenAPI profile.
  - `trigger-integration.md` — deployment secret, reachability, trigger binding.
  - `deployed-hitl-integration.md` — signed approval webhooks and approval UI.
  - `resume-audit.md` — inferring the stage of a partial deployment.
  - `troubleshooting.md` — import, connection, and mapping failures.
