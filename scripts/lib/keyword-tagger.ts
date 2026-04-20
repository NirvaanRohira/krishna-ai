const THEME_MAP: Array<[RegExp, string]> = [
  [/dharma/i, 'dharma'],
  [/karma/i, 'karma'],
  [/yoga/i, 'yoga'],
  [/ātm[aā]n?/i, 'self'],
  [/brahman/i, 'brahman'],
  [/mokṣa|moksha/i, 'liberation'],
  [/jñāna|jnana/i, 'knowledge'],
  [/bhakti/i, 'devotion'],
  [/kṣatra|ksatra|warrior/i, 'duty'],
  [/mana[sś]/i, 'mind'],
  [/buddhi/i, 'intellect'],
  [/śāstra|shastra/i, 'scripture'],
  [/yuddha|battle|war/i, 'war'],
  [/kāma|kama/i, 'desire'],
  [/krodha/i, 'anger'],
  [/māyā|maya/i, 'illusion'],
  [/sat/i, 'truth'],
  [/ahiṃsā|ahimsa/i, 'nonviolence'],
  [/tapas/i, 'austerity'],
  [/guṇa|guna/i, 'qualities'],
  [/arjuna/i, 'arjuna'],
  [/kṛṣṇa|krishna/i, 'krishna'],
]

export function tagVerse(text: string): string[] {
  const tags: string[] = []
  for (const [pattern, tag] of THEME_MAP) {
    if (pattern.test(text) && !tags.includes(tag)) {
      tags.push(tag)
    }
    if (tags.length >= 5) break
  }
  return tags.length > 0 ? tags : ['gita']
}
