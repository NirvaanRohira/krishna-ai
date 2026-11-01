// Names shown on the book's cover and chapter headings. Public, traditional titles.

export const GITA_CHAPTERS: [iast: string, english: string][] = [
  ['Arjunaviṣādayoga', "Arjuna's Despair"],
  ['Sāṅkhyayoga', 'The Path of Knowledge'],
  ['Karmayoga', 'The Path of Action'],
  ['Jñānakarmasaṃnyāsayoga', 'Knowledge and Renunciation of Action'],
  ['Karmasaṃnyāsayoga', 'Renunciation of Action'],
  ['Dhyānayoga', 'The Path of Meditation'],
  ['Jñānavijñānayoga', 'Knowledge and Realisation'],
  ['Akṣarabrahmayoga', 'The Imperishable'],
  ['Rājavidyārājaguhyayoga', 'The Royal Secret'],
  ['Vibhūtiyoga', 'The Divine Glories'],
  ['Viśvarūpadarśanayoga', 'The Vision of the Universal Form'],
  ['Bhaktiyoga', 'The Path of Devotion'],
  ['Kṣetrakṣetrajñavibhāgayoga', 'The Field and its Knower'],
  ['Guṇatrayavibhāgayoga', 'The Three Qualities'],
  ['Puruṣottamayoga', 'The Supreme Person'],
  ['Daivāsurasaṃpadvibhāgayoga', 'The Divine and the Demonic'],
  ['Śraddhātrayavibhāgayoga', 'The Three Kinds of Faith'],
  ['Mokṣasaṃnyāsayoga', 'Liberation through Renunciation'],
]

export type BookKind = 'gita' | 'bhagavatam' | 'other'

export const BOOK_TITLES: Record<BookKind, { devanagari: string; latin: string }> = {
  gita: { devanagari: 'श्रीमद्भगवद्गीता', latin: 'Bhagavad Gita' },
  bhagavatam: { devanagari: 'श्रीमद्भागवतम्', latin: 'Srimad Bhagavatam' },
  other: { devanagari: 'शास्त्र', latin: 'The Teachings' },
}
