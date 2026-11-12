# TOBI project guidance

Application code lives in `tobi-prototype/`.

## UX collaboration

For customer-facing UI, conversation flows, navigation, or substantial copy changes, delegate design to the `tobi_ux` agent before implementation and request its review of the implemented result afterward. Use `.agents/skills/tobi-chatbot-ux/SKILL.md`. Pass the user goal, relevant files, constraints, and available screenshots. Internal changes without customer impact do not require UX delegation.

The UX agent uses `gpt-6-astra` with `high` reasoning. If the custom agent is unavailable, spawn a separate agent with these settings and the instructions from `.codex/agents/tobi-ux.toml`. If delegation is unavailable, apply the skill directly and disclose that no independent review occurred. Never silently substitute a model.

For chat-widget sizing or responsive work, the design handoff and implementation review must include a realistic rich-response scenario in the smallest supported container. Do not accept an empty-state screenshot as sufficient evidence. Include carousel controls and CTA, the tallest relevant block, a long response and the composer; verify control bounds against the visible message area so primary controls are available before scrolling through the component they control.

The main agent owns implementation and resolves technical tradeoffs. UX review is part of the authorized task, not a new user approval gate. Fix material findings within scope; do not expand into an unsolicited redesign.

For an explicit UX audit, return findings without changing the application unless implementation was requested. Do not claim browser or user validation without performing it.

## Architecture collaboration

For major architectural changes, LLM integration, database design, RAG, or security changes, the main Codex agent must delegate an architectural assessment to the `tobi_architect` agent before implementation. The main agent remains responsible for implementation and technical tradeoffs.

The `tobi_architect` agent is responsible for architectural proposals and reviews. For major changes, architecture review must happen before implementation, and the Product Owner must approve the proposed architecture. After a significant implementation, `tobi_architect` may perform an independent review.

Architecture approval covers architecture, security, non-functional requirements, integrations, API contracts and significant technology decisions. It is not a QA release decision. The architect owns the substance of architecture decisions and ADRs; `tobi_documentation` owns their consistent publication and maintenance.

## Development collaboration

The `tobi_developer` agent is the primary implementation agent. Delegate implementation work to it when available, while the main Codex agent remains responsible for the overall outcome and resolution of technical tradeoffs.

Routine implementation tasks do not require unnecessary approval. They should proceed directly when the scope is clear and none of the architecture-review triggers above apply.

The developer owns production code plus the unit and integration tests needed for the change. Before QA handoff, run lint, typecheck, relevant tests and build, record the exact immutable commit SHA and summarize changed files and verification. The developer may not waive, impersonate or bypass QA approval.

## Quality assurance collaboration

Use `tobi_qa` for release-impacting changes, bug fixes with regression risk, API or integration changes, LLM/RAG/conversation behavior, security-sensitive behavior, structured UI responses, accessibility/responsiveness, and staging candidates. QA owns the release test strategy, regression and end-to-end coverage, defect severity, evidence review and the final GO/NO-GO decision for staging.

QA must verify the actual candidate and bind every decision to the exact 40-character commit SHA. A code or documentation change creates a new candidate and invalidates prior QA and documentation attestations. QA may edit tests, fixtures and test documentation, but returns production-code fixes to the developer. Never report an unexecuted check as passed.

## Documentation collaboration

Use `tobi_documentation` whenever behavior, architecture, API, configuration, knowledge sources, integration, tests, operations or release instructions change. The specialist maintains versioned documentation sources in `tobi-prototype/docs/` and issues Documentation READY or NOT READY for the exact candidate SHA.

For architecture content, the architect approves technical substance; for customer-facing behavior, UX confirms the described experience; for regression coverage, QA confirms the catalog. Documentation readiness does not replace QA GO. The `/doc` route is currently not implemented, so documentation must be updated in repository sources and publication reported as blocked rather than claimed as available.

## Change classification and orchestration

The main agent classifies each request before implementation and remains responsible for scope, coordination and technical tradeoffs.

1. Inspect the existing implementation, repository instructions and current working tree.
2. Engage `tobi_architect` before implementation when architecture, LLM, database, RAG, security, external services, material cost or major refactoring is affected. Product Owner approval is required for the proposed major architecture, not for routine implementation.
3. Engage `tobi_ux` before customer-facing UI, conversational flow, navigation or substantial copy changes, and request implementation review afterward.
4. Delegate implementation to `tobi_developer` when available.
5. Have `tobi_qa` independently verify the change and return defects with severity, evidence and reproducible steps.
6. Have `tobi_documentation` update versioned sources and attest readiness for the candidate SHA.
7. Re-run all required automated checks on the final SHA; QA then issues the final GO/NO-GO for that same SHA.
8. Only a valid staging gate may trigger staging deployment. After deployment, run and record smoke tests.

Do not create open-ended agent loops. After two unsuccessful correction attempts for the same defect, stop the cycle and escalate with the candidate SHA, evidence, attempted fixes, current owner, impact and a concrete recommended decision.

## Staging and production release policy

Staging does not require an additional Product Owner approval when all of the following are true for the same immutable commit SHA:

- the developer handoff is READY;
- lint, typecheck, required regression tests and build passed with traceable evidence;
- every architecture or UX review required by the change classification is complete;
- `tobi_documentation` issued Documentation READY;
- `tobi_qa` issued final GO;
- no critical functional or security defect is open;
- the staging target, deployment mechanism, CI identity, credentials and rollback path have been verified.

The gate is commit-bound: any code, test, configuration or documentation change invalidates prior attestations and requires the checks and approvals again. QA may block staging with NO-GO. Documentation NOT READY also blocks staging.

Automatic approval applies only to staging. Production deployment always requires explicit Product Owner approval for the exact production release. A staging GO, Documentation READY or staging artifact is not production approval. Changes to secrets, access rights, public sharing, production data, DNS/domains or material cost always require separate explicit approval.

The repository currently has no verified automated staging deployment mechanism. Configure and validate the release gate, but do not claim deployment succeeded or add a speculative deploy job. Until the staging target/URL, deploy command or API, CI identity and credentials, rollback mechanism, and smoke-test authentication are supplied and verified, report deployment as BLOCKED.
