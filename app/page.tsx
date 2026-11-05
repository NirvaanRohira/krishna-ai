import Link from 'next/link'
import { ThemeToggle } from '@/components/ThemeToggle'
import { LanguageToggle } from '@/components/LanguageToggle'
import { MessageBubble } from '@/components/MessageBubble'
import { getT } from '@/lib/i18n/server'

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

const SAMPLE_HI = {
  user1: 'मैं अपने कर्तव्य और अपनी इच्छा के बीच उलझा हूँ।',
  kanha1: 'दोनों के बीच खिंचे हुए हैं। जब आप सोचते हैं कि आपने वह चुना जो आप चाहते हैं, तो सबसे पहले किसकी निराशा दिखती है?',
  user2: 'पिताजी की। उन्होंने यह व्यापार मेरे लिए खड़ा किया।',
  reply: `तो यह कर्तव्य बनाम इच्छा नहीं है। यह पिता के प्रति प्रेम और उस राह के बीच है जिसे आप अपनी मानते हैं।
<page ref="bhagavad_gita chapter 3 verse 35" title="अपना धर्म, अधूरा ही सही">
<moment>कुरुक्षेत्र के मैदान में अर्जुन धनुष रखकर वह जीवन जीना चाहता था जो उसका नहीं था। उसे लगा कि दूसरी राह कम लोगों को दुख देगी।</moment>
<teaching>कृष्ण उससे कहते हैं कि दूसरे का धर्म अच्छी तरह निभाने से अपना धर्म, कमियों के साथ भी, निभाना बेहतर है।</teaching>
<life>पिताजी का सपना उनकी राह थी। उनका सम्मान करने का मतलब शायद यह है कि आप उन्हें धीरे से, पूरी बात बताएँ कि आपकी राह क्या है, न कि आधे मन से उनकी राह जिएँ।</life>
<practice>आज रात वह एक वाक्य लिखिए जो आप उनसे कहते, अगर उन्हें दुख पहुँचाने का डर न होता।</practice>
</page>
वह वाक्य क्या होगा?`,
}

// The first viewport is the thesis: Krishna's likeness, the promise, and a real-shaped
// exchange (labelled as an example) so a visitor sees what an answer looks like.
export default async function Home() {
  const { lang, t } = await getT()
  const hiSample = lang === 'hi'
  return (
    <main className="landing-page">
      <div className="landing-theme"><LanguageToggle /><ThemeToggle /></div>
      <section className="landing-hero">
        <div className="landing-figure settle-in">
          {/* The first thing anyone sees, so it loads first, at the size this screen needs:
              AVIF where supported (63 KB on most phones, vs 316 KB for the full WebP). */}
          <picture>
            <source
              type="image/avif"
              srcSet="/avatar/poster-divine-v2-480.avif 480w, /avatar/poster-divine-v2-720.avif 720w"
              sizes="(min-width: 900px) 41vh, 24vh"
            />
            <img
              src="/avatar/poster-divine-v2.webp"
              srcSet="/avatar/poster-divine-v2-480.webp 480w, /avatar/poster-divine-v2.webp 720w"
              sizes="(min-width: 900px) 41vh, 24vh"
              width={720}
              height={1440}
              fetchPriority="high"
              decoding="async"
              alt={t('home.image_alt')}
            />
          </picture>
        </div>

        <div className="landing-copy">
          <h1 className="landing-title settle-in">
            {hiSample ? 'कान्हा' : 'Kanha'}
            <span lang={hiSample ? 'en' : 'hi'}>{hiSample ? 'Kanha' : 'कान्हा'}</span>
          </h1>
          <p className="landing-lede settle-in">
            {t('home.lede_1')} <strong>{t('home.lede_strong')}</strong>{t('home.lede_2')}
          </p>

          <Link href="/chat" className="btn-primary landing-begin settle-in">
            {t('home.begin')}
          </Link>

          <p className="landing-disclaimer">
            {t('common.disclaimer')} <Link href="/pricing">{t('common.plans')}</Link> · <Link href="/privacy">{t('common.privacy')}</Link> · <Link href="/terms">{t('common.terms')}</Link>
          </p>
        </div>
      </section>

      <section className="landing-journey" aria-labelledby="journey-title">
        <h2 id="journey-title">{t('home.journey_title')}</h2>
        <p className="landing-journey-lede">{t('home.journey_lede')}</p>
        <figure className="landing-sample" aria-label={t('home.sample_label')}>
          <figcaption className="landing-sample-label">{t('home.sample_label')}</figcaption>
          <p className="msg-user">{hiSample ? SAMPLE_HI.user1 : 'I’m torn between my duty and what I want.'}</p>
          <p className="msg-assistant">{hiSample ? SAMPLE_HI.kanha1 : 'Torn between the two. When you picture choosing what you want, whose disappointment do you see first?'}</p>
          <p className="msg-user">{hiSample ? SAMPLE_HI.user2 : 'My father’s. He built the business for me.'}</p>
          <div className="msg-assistant">
            <MessageBubble role="assistant" content={hiSample ? SAMPLE_HI.reply : SAMPLE_REPLY} sources={SAMPLE_SOURCES} />
          </div>
        </figure>
      </section>
    </main>
  )
}
