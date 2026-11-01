import { refLabel, type ScripturePage as Page } from '@/lib/scripture-page'

/**
 * A page of scripture opening inside the conversation: a chapter seal (the chapter in
 * Devanagari inside a lotus of hairlines), the passage's place, its title, then the moment
 * in the story, the teaching, what it means for you, and one practice for today.
 * `verified` is false when the reference wasn't among the retrieved passages; we then show
 * the teaching without claiming a chapter and verse.
 */
export function ScripturePage({ page, verified = true }: { page: Page; verified?: boolean }) {
  const label = verified ? refLabel(page.ref) : { book: 'From the teachings', place: '', numeral: 'ॐ' }
  const sections: [string, string][] = [
    ['The moment', page.moment],
    ['The teaching', page.teaching],
    ['In your life', page.life],
    ['For today', page.practice],
  ]
  return (
    <article className={`scripture-page${page.complete ? ' scripture-page--open' : ''}`} aria-label={`${label.book}${label.place ? `, ${label.place}` : ''}`}>
      <header className="scripture-page__head">
        <svg className="scripture-page__seal" viewBox="0 0 120 120" aria-hidden="true">
          <g fill="none" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round">
            <circle cx="60" cy="60" r="56" opacity="0.35" />
            <circle cx="60" cy="60" r="44" opacity="0.6" />
            {Array.from({ length: 8 }, (_, i) => (
              <path
                key={i}
                d="M60 16 C70 30 70 42 60 52 C50 42 50 30 60 16 Z"
                transform={`rotate(${i * 45} 60 60)`}
                opacity="0.55"
              />
            ))}
          </g>
          <circle cx="60" cy="60" r="19" className="scripture-page__seal-core" />
          <text x="60" y="61" textAnchor="middle" dominantBaseline="central" className="scripture-page__numeral">{label.numeral}</text>
        </svg>
        <div>
          <p className="scripture-page__book">{label.book}</p>
          {label.place && <p className="scripture-page__place">{label.place}</p>}
          {page.title && <h3 className="scripture-page__title">{page.title}</h3>}
        </div>
      </header>
      <div className="scripture-page__body">
        {sections.map(([name, text]) =>
          text ? (
            <section key={name} className="scripture-page__section">
              <h4>{name}</h4>
              <p>{text}</p>
            </section>
          ) : null,
        )}
        {!page.complete && <p className="scripture-page__turning" aria-live="polite">The page is opening…</p>}
      </div>
    </article>
  )
}
