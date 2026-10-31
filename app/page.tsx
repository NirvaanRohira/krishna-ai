import Link from 'next/link'

// The first viewport is the thesis: Krishna's likeness, the promise, and a real-shaped
// exchange (labelled as an example) so a visitor sees what an answer looks like.
export default function Home() {
  return (
    <main className="landing-page">
      <section className="landing-hero">
        <div className="landing-figure fade-up">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/avatar/poster-divine-v2.webp" alt="An artistic, AI-animated depiction of Krishna playing the flute" />
        </div>

        <div className="landing-copy">
          <h1 className="landing-title fade-up fade-up-delay-1">
            Kanha
            <span lang="hi">कान्हा</span>
          </h1>
          <p className="landing-lede fade-up fade-up-delay-1">
            Bring what is on your mind. <strong>Talk it through with the Bhagavad Gita</strong>, by text or
            face to face, in English, Hindi or your own language.
          </p>

          <Link href="/login" className="btn-primary landing-begin fade-up fade-up-delay-2">
            Begin a conversation
          </Link>

          <figure className="landing-sample fade-up fade-up-delay-3" aria-label="Example conversation">
            <figcaption className="landing-sample-label">Example conversation</figcaption>
            <p className="msg-user">I didn&rsquo;t get the job I worked for all year. What was the point?</p>
            <p className="msg-assistant">
              The year wasn&rsquo;t wasted. In the Gita, Krishna tells Arjuna that our right is to the work
              itself, never to its fruits. What you built in yourself this year is still yours. What would
              you do next if the result were not the measure?
            </p>
          </figure>

          <p className="landing-disclaimer">
            Kanha is an AI drawing from Sanskrit texts. It is not God, not Krishna, and not a spiritual
            authority. <Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link>
          </p>
        </div>
      </section>
    </main>
  )
}
