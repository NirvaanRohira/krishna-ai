import Link from 'next/link'
import { ThemeToggle } from '@/components/ThemeToggle'
import { MessageBubble } from '@/components/MessageBubble'

// The reply format, shown as a labelled example: name the root, open one page, ask one question.
const SAMPLE_SOURCES = [{
  text_source: 'bhagavad_gita',
  book_chapter: 3,
  verse: 35,
  text: 'śreyān svadharmo viguṇaḥ paradharmāt svanuṣṭhitāt\nsvadharme nidhanaṃ śreyaḥ paradharmo bhayāvahaḥ',
}]

const SAMPLE_REPLY = `So it isn't duty against desire. It's love for your father against the path you feel is yours.
<page ref="bhagavad_gita chapter 3 verse 35" title="Your own path, even imperfect">
<moment>On the field of Kurukshetra, Arjuna wanted to lay down his bow and live a life that was not his to live. He thought another path would hurt fewer people.</moment>
<teaching>Krishna tells him it is better to follow one's own dharma, even imperfectly, than another's dharma done well.</teaching>
<life>Your father's dream was his path. Honouring him may mean telling him, gently and fully, what yours is, rather than living his half-heartedly.</life>
<practice>Tonight, write one sentence you would say to him if you weren't afraid of hurting him.</practice>
</page>
What would that sentence be?`

// The first viewport is the thesis: Krishna's likeness, the promise, and a real-shaped
// exchange (labelled as an example) so a visitor sees what an answer looks like.
export default function Home() {
  return (
    <main className="landing-page">
      <div className="landing-theme"><ThemeToggle /></div>
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

          <Link href="/chat" className="btn-primary landing-begin fade-up fade-up-delay-2">
            Begin a conversation
          </Link>


          <p className="landing-disclaimer">
            Kanha is an AI drawing from Sanskrit texts. It is not God, not Krishna, and not a spiritual
            authority. <Link href="/pricing">Plans</Link> · <Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link>
          </p>
        </div>
      </section>

      <section className="landing-journey" aria-labelledby="journey-title">
        <h2 id="journey-title">Not answers. A conversation that finds what&rsquo;s underneath.</h2>
        <p className="landing-journey-lede">Kanha asks before it advises. When it understands what is really troubling you, it opens the scripture to the verse that speaks to it.</p>
            <figure className="landing-sample" aria-label="Example conversation">
              <figcaption className="landing-sample-label">Example conversation</figcaption>
              <p className="msg-user">I&rsquo;m torn between my duty and what I want.</p>
              <p className="msg-assistant">Torn between the two. When you picture choosing what you want, whose disappointment do you see first?</p>
              <p className="msg-user">My father&rsquo;s. He built the business for me.</p>
              <div className="msg-assistant">
                <MessageBubble role="assistant" content={SAMPLE_REPLY} sources={SAMPLE_SOURCES} />
              </div>
            </figure>
      </section>
    </main>
  )
}
