# Project context

Verified from the project README on 2026-10-30; inspect current code before relying on implementation details.

TOBi Studio is an interactive Vodafone TOBI prototype for visual style, telco knowledge and conversation flows. Application root: `tobi-prototype/`.

Relevant files:
- `components/tobi-studio.tsx`: interactive prototype and UI.
- `app/globals.css`: visual system and animation.
- `app/api/chat/route.ts`: demo and live response behavior.
- `lib/vodafone-knowledge.ts`: curated telco knowledge.

The README describes intent confirmation, short structured responses, quick replies, verified-source links, safety notices, feedback and contextual operator handoff. These are existing design choices to evaluate, not immutable requirements.

The app has a local demo mode without an API key. Do not interpret demo responses as proof of live integrations. Brand guidelines, user research and production analytics have not been supplied as part of this setup. Do not invent them. Follow existing styling provisionally and identify decisions that require actual brand or user evidence.
