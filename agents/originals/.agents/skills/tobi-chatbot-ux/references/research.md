# Evidence and freshness

Before a substantial redesign or a recommendation presented as current best practice, search for evidence relevant to the specific decision. Prefer original studies, official standards and documented methodology. Useful starting organizations include W3C/WAI, Microsoft Research, Google PAIR and Nielsen Norman Group; search and read the actual relevant source rather than citing an organization's name as evidence.

For each retained finding record the claim, direct source URL, publication/update date when available, verification date, study context, limitations and implication for TOBI. Separate empirical findings, normative requirements, vendor recommendations and design hypotheses. Recent publication alone does not establish quality or applicability.

Recheck evidence when the decision depends on changing technology, standards or product behavior. Stable findings can be reused with their context and verification date. Do not repeat a broad literature search for trivial styling changes. If browsing is unavailable, disclose the freshness limitation and proceed with clearly labeled assumptions where useful.

No external UX research has yet been verified or imported into this project. This file defines the maintenance process; it is not a completed evidence base. Add compact, verified findings here as actual tasks require them. Do not store raw customer conversations or personal data in research notes.

## Carousel controls and discoverability (verified 2026-11-01)

- W3C WAI-ARIA APG Carousel Pattern, https://www.w3.org/WAI/ARIA/apg/patterns/carousel/ (update date not stated): native previous/next buttons, normal tab order and stable focus are the recommended implementation pattern. If a carousel does not auto-rotate, no rotation control is needed. This is normative-adjacent implementation guidance, not TOBi user research.
- W3C WCAG 2.2 Understanding 2.5.8, https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html (page current in 2026): pointer targets should be at least 24 by 24 CSS px unless an exception applies. TOBi uses 44 by 44 px carousel arrows as a product choice above that minimum.
- Nielsen Norman Group, Designing Effective Carousels, https://www.nngroup.com/articles/designing-effective-carousels/ (published 2013-09-14, revised 2026-08-07): hidden carousel content is often overlooked and controls must be obvious. Applied hypothesis for TOBi: show all four topics when they fit; expose navigation only when content actually overflows. This source is general web guidance, not a study of TOBi customers.
