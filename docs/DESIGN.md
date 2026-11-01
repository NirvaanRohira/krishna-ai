# Kanha design system: "Vrindavan dawn" and "Vrindavan night"

**Two themes.** Dawn (light) is the default: ivory paper, indigo ink, saffron-gold, like a printed Gita in morning light. Night is one tap away (the sun/moon button on the landing page and in the chat header); the choice is saved on the device and applied before first paint (`app/layout.tsx`). The avatar room (`.avatar-panel.theme-night`) is always night, like a temple sanctum, because the figure's glowing edges were painted for darkness. On the dawn landing page the figure stands in an indigo arch (`--niche`) for the same reason.

**Theme rules:** never write a raw colour in a component or in `globals.css` rules. Use a token; if none fits, add it to *both* `:root, .theme-night` and `:root[data-theme='light']`. Gold *as text* (links, citations, the Devanagari subtitle) is `--gold-text`, never `--gold`: plain gold fails contrast on ivory. axe (WCAG 2 AA) must pass in both themes.

Taken from the reference art: night indigo, the iridescent silk of the dhoti, the gold dupatta, pearl light. The interface should feel like sitting under a night sky with someone wise, not like using a SaaS tool.

## The journey (how a conversation should feel)

A conversation is a small journey of self-understanding, not a Q&A:
1. **Find the root.** For a personal struggle, Kanha reflects one line back and asks one gentle question (at most two turns) before teaching.
2. **Open the page.** Kanha names the root in the person's words, then opens one `ScripturePage`: a chapter seal (chapter in Devanagari inside a hairline lotus), the book and place, a title, then *The moment* (the scene in the story, italic display type), *The teaching*, *In your life*, and *For today* (one practice). The card unfolds like a page turning.
3. **One question** after the page, nothing else.

The model writes the page as `<page ref="…" title="…"><moment/><teaching/><life/><practice/></page>` (`lib/scripture-page.ts`). A reference not among the retrieved passages is shown without chapter and verse. The voice reads the page as prose. Ambient sound is a WebAudio tanpura (`hooks/useAmbient.ts`), off by default, ducked while Kanha speaks.

## Rules

- **Ground:** night indigo (`--night-0…3`) with a faint aurora at the top and a static star field. No flat black.
- **The seeker's voice is pearl:** user messages use `--pearl-wash` (pink → lilac → aqua, low alpha) on `--night-2`, with a 1px pearl hairline. Nothing else uses the pearl wash.
- **The guide's voice is typeset, not boxed:** assistant replies are plain text at 1.04rem / 1.75 line height, at most 66ch wide. No bubble.
- **Gold means action:** `--gold` is used only for primary buttons, send, focus rings, selection, links and verse citations. Never for decoration.
- **Hairlines, not boxes:** structure comes from 1px `--hairline` rules (header, citations, starter list, onboarding). No cards inside cards, and no coloured side borders thicker than 1px.
- **Type:** Tiro Devanagari Hindi (`--font-display`) for the wordmark, headings and verse citations. Mukta (`--font-body`) for everything else. Both cover Devanagari. Display text stays at or below 6rem with tracking no tighter than -0.03em.
- **Contrast:** `--ink` 16.6:1, `--ink-2` 10.5:1, `--ink-3` 6.7:1 on `--night-1`. Small text never goes below `--ink-3`.
- **Motion:** one authored moment: content *rises* (opacity + 12px + blur → sharp, `--ease-out`). Streaming shows a single breathing pearl. Everything respects `prefers-reduced-motion`.
- **Browser surfaces are themed:** selection, caret, scrollbars, focus rings and checkboxes.
- **The AI label is part of the design, not fine print:** the disclaimer line sits under the chat header, "AI depiction · not divine" sits on the avatar, and the landing page says it in plain words. Never hide or shrink these below `--ink-3` at 0.72rem.
- **Icons:** hand-authored SVG at a 1.6 stroke weight. No emoji as icons. The brand mark is a peacock-feather eye (`components/Mark.tsx`).
- **Proof over claims:** answers show "Drawn from" verse citations. The landing page shows a labelled example conversation.

## Tokens

All tokens are in `app/globals.css` under `:root`. Legacy aliases (`--fg`, `--accent` …) exist only for old inline styles; don't use them in new code.
