# Scripture corpus: sources and licence status

_Audit of 31 Oct 2026. I'm not a lawyer: this lists the facts and the risks; take the decision with Indian IP counsel before charging money._

The texts themselves (the Gita, the Upanishads, the Bhagavatam, the Yoga Sutras) are thousands of years old and in the public domain. **The digital editions we copied are not automatically free to use commercially.** A critical edition can carry its editors' rights, and the websites that host these files attach usage terms. Under Indian law, a work needs a "modicum of creativity" to get copyright (*Eastern Book Co. v. D.B. Modak*, 2008). Editorial choices in a critical edition can meet that bar; a plain transcription usually doesn't. Site terms are a separate, contractual question.

| Text in DB | Where it came from | What the source says | Risk for a paid app |
|---|---|---|---|
| Bhagavad Gita (`bhagavad_gita`) | GRETIL HTML, stored in `scripts/data/raw/bhagavad_gita_gretil.htm` | "Text based on the **BORI edition** of the Mahabharata … entered by Muneo Tokunaga et al., revised by John Smith … THIS GRETIL TEXT FILE IS FOR **REFERENCE PURPOSES ONLY**! COPYRIGHT AND TERMS OF USAGE AS FOR SOURCE FILE." | **Medium.** Critical-edition text (BORI, Pune), "reference only". |
| Srimad Bhagavatam (`bhagavatam`) | GRETIL plaintext (`ingest-bhagavatam.ts`) | Same standard GRETIL notice | **Medium** |
| Yoga Sutras (`yoga_sutras`) | GRETIL plaintext (`ingest-yoga-sutras.ts`) | Same standard GRETIL notice | **Medium** |
| Isha, Katha, Prashna, Mandukya, Aitareya Upanishads | GRETIL plaintext (`ingest-upanishads.ts`) | Same standard GRETIL notice | **Medium** |
| Kena, Mundaka, Taittiriya Upanishads | sanskritdocuments.org ITRANS files (`ingest-local-upanishads.ts`) | The ingest script itself notes "volunteer-transcribed, **personal study use**" | **Medium–high** for commercial use |
| English translations | none stored (the model paraphrases) | — | Low. **Keep it that way**: never paste copyrighted translations (e.g. BBT / Prabhupada, Easwaran, Gita Press English) into the corpus or prompts. |

## Where it shows up

- The Sanskrit text is sent to the LLM as context (internal use).
- **The new "Drawn from" panel shows the verse text to users.** That is republication, so it's the part to settle first.

## Options, cheapest first

1. **Ask.** Email GRETIL (Göttingen), John Smith (Cambridge) for the Mahabharata e-text, and sanskritdocuments.org for permission to use their transcriptions in a commercial app with attribution. Many such projects say yes to attribution plus a link. Keep the replies in `docs/licences/`.
2. **Replace with clearly-licensed sources**, for example Sanskrit Wikisource (text public domain, site CC BY-SA, attribution required) or public-domain printed editions (pre-1950s publications whose editors died more than 60 years ago, under India's term) that you transcribe or OCR yourselves.
3. **Until settled (built, and the default):** users see only the verse *reference* (e.g. "Gita 2.47"). The server withholds the verse text unless `SHOW_VERSE_TEXT=true` (`lib/sources-server.ts`). Turn it on once permission is in hand.
4. **Always:** an "Attributions" section on `/terms` crediting each source and editor.

Owner: founder plus counsel. Status: **open**. With the text hidden by default, the remaining exposure is the internal use of these editions as model context. Settle that before paid launch.
