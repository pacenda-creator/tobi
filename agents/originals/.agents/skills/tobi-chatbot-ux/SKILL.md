---
name: tobi-chatbot-ux
description: Design and review TOBI customer-facing chatbot flows, Czech copy, visual UI and accessibility. Use for UX audits and customer-facing changes, excluding purely internal refactoring.
---

# TOBI conversational and visual UX

Read [project context](references/project-context.md) before proposing changes. For research-dependent decisions, follow [research guidance](references/research.md).

## Design

Inspect the relevant implementation and available rendered screens. Establish the customer's task, context, constraints and observable success. Label assumptions; ask only when missing information prevents useful progress.

Design conversation and interface together. Choose text, quick replies, cards or forms according to the task. Confirm intent when uncertainty or the impact of error warrants it, rather than adding confirmation to every turn. Cover loading, streaming, interruption, misunderstanding, retry, return, completion and operator handoff with context where relevant. Distinguish demo data from live account information and advice from completed actions.

During design and review, name the distinct customer outcome of each proposed CTA. If the current response already delivers that outcome, omit the CTA and verify that the task can be completed directly.

Use the existing brand and components. Specify hierarchy, typography, spacing, color roles, responsive behavior and interaction states in implementable terms. Show significant visual changes on a concrete screen or prototype when tools permit. Evaluate keyboard navigation, focus, contrast, readable content and announcement of new messages. Do not claim accessibility conformance from a screenshot alone.

For substantial chat-widget layout or sizing changes, review realistic rich states in the smallest supported container, not only the welcome or empty state. Exercise the tallest relevant configured block, carousel navigation and CTA, a long response, and the composer together. Primary controls must be discoverable without first scrolling through the component they control; flag nested scrollbars, clipped controls, composer overlap and navigation below tall carousel content as material findings. Record the exact container size and which controls are visible before scrolling.

Provide the recommended solution, concise rationale, actual Czech copy, relevant states and observable acceptance criteria. Offer alternatives only for meaningful tradeoffs. Avoid generic chatbot best-practice lists unrelated to the task.

## Implementation review

Compare the actual result against acceptance criteria and walk through affected scenarios on desktop and mobile when tools permit. Record what was actually checked and what remains unverified. Rank findings by impact on task completion, comprehension, accessibility or trust. Experiential review by an agent is expert review, not a user study.

Do not approve a responsive widget change from static empty-state screenshots alone. Require rendered evidence for the smallest compact widget with at least one rich response; for carousels check the first, middle and last position, visible previous/next state, keyboard operation and access to the composer. DOM presence or a generic visibility assertion is insufficient: compare control bounds with the visible message area and composer.

Use task completion, recovery success, unnecessary turns and handoff quality as candidate measures. Do not optimize containment or short conversations at the expense of solving the customer's problem. Never fabricate measurements.
