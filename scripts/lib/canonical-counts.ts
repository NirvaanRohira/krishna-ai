export const CANONICAL_VERSE_COUNT: Record<string, number> = {
  bhagavad_gita: 700,

  // Principal Upanishads (from GRETIL CC BY-NC-SA 4.0)
  isha_upanishad: 18,
  katha_upanishad: 119,
  mandukya_upanishad: 12,
  prashna_upanishad: 54,   // GRETIL edition encodes 54 mula-text verses (standard count 67; 13 missing in this digitization)
  aitareya_upanishad: 23, // GRETIL file only encodes Adhyaya 1 (standard has 3 adhyayas ~33 mantras)

  // Yoga Sutras of Patanjali (from GRETIL CC BY-NC-SA 4.0)
  yoga_sutras: 195,  // Philipp Maas critical edition (GRETIL); other editions count 196 by splitting 3.22

  // Remaining principal Upanishads (from sanskritdocuments.org .itx files)
  kena_upanishad: 35,        // 4 khandas: 9+5+12+9
  mundaka_upanishad: 64,     // 6 sections (3 Mundakas × 2 Khandas): 9+13+10+11+10+11
  taittiriya_upanishad: 31,  // 3 vallis, each anuvaka = one verse: 12+9+10

  // Bhagavatam — all 12 Skandhas (GRETIL CC BY-NC-SA 4.0)
  bhagavatam: 14092,
}

// Upanishads not yet found on GRETIL plaintext server (search ongoing):
// kena_upanishad: 34
// mundaka_upanishad: 64
// taittiriya_upanishad: 49
