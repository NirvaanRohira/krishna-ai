const SYNONYMS: Record<string, string[]> = {
  karma: ['karma', 'karman', 'action', 'deed', 'fruit of action'],
  dharma: ['dharma', 'duty', 'righteousness', 'right action', 'svadharma'],
  yoga: ['yoga', 'union', 'discipline', 'path', 'yoke'],
  atman: ['atman', 'atma', 'self', 'soul', 'inner self'],
  brahman: ['brahman', 'absolute', 'ultimate reality', 'supreme'],
  moksha: ['moksha', 'liberation', 'freedom', 'mukti', 'release'],
  ahimsa: ['ahimsa', 'non-violence', 'non-harm', 'compassion'],
  maya: ['maya', 'illusion', 'delusion', 'appearance'],
  samsara: ['samsara', 'cycle of rebirth', 'cycle of existence'],
  satya: ['satya', 'truth', 'truthfulness'],
  tapas: ['tapas', 'austerity', 'discipline', 'penance'],
  seva: ['seva', 'selfless service', 'service'],
  bhakti: ['bhakti', 'devotion', 'love', 'worship'],
  jnana: ['jnana', 'jnanam', 'knowledge', 'wisdom', 'understanding'],
  vairagya: ['vairagya', 'detachment', 'dispassion', 'renunciation'],
}

export function expandQuery(query: string): string {
  const normalized = query.toLowerCase()
  const additions: string[] = []

  for (const [term, synonyms] of Object.entries(SYNONYMS)) {
    if (normalized.includes(term)) {
      const extras = synonyms.filter((s) => !normalized.includes(s))
      if (extras.length > 0) additions.push(...extras)
    }
  }

  if (additions.length === 0) return query
  return `${query} (${additions.join(', ')})`
}
