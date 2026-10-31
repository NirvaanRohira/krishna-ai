# Legal and policy: India

Not legal advice. These are the things to design for and to take to an Indian lawyer before launch. Verify current dates and thresholds; the DPDP Rules phase in over 2026–27.

## Digital Personal Data Protection Act, 2023 (DPDP) + DPDP Rules, 2025

- **Notice:** before collecting, give a clear, standalone notice: what personal data, for what purpose, how to withdraw consent, how to exercise rights, how to complain to the **Data Protection Board**. Offer it in English and the languages of the Constitution's Eighth Schedule when your users need them.
- **Consent:** free, specific, informed, unconditional and unambiguous, by a clear affirmative action. That means **separate unticked boxes per purpose**, no bundling into the terms, and no consent as a condition for things that don't need the data. Keep **proof** (who, what version, when) in an append-only ledger.
- **Withdrawal** must be as easy as giving consent: a one-tap toggle. Then stop processing and get processors to stop.
- **Children = under 18.** You need **verifiable parental consent**, and **no tracking, behavioural monitoring or targeted advertising** of children. Simplest compliant launch: **18+ only, with an age gate**. If you allow minors, implement verifiable parental consent as the Rules prescribe.
- **Rights:** access/summary, correction, completion, update, erasure, grievance redressal, and nominating someone (for death or incapacity). Build self-serve export and delete, plus a way to view and correct inferred profiles.
- **Retention:** erase when the purpose is served or consent is withdrawn; the Rules set inactivity-based erasure for some large platforms. Run scheduled purge jobs and state periods in the notice.
- **Security safeguards:** encryption, access control, logging and monitoring, backups. Failure to protect is the costliest penalty category: up to ₹250 crore per breach.
- **Breach:** notify the Board and **each affected user**, in the manner and timelines the Rules set. Have templates ready.
- **Processors** (cloud, LLM, email, analytics): written contracts; you remain responsible. Cross-border transfers are allowed except to countries the government restricts. Watch the notified list.
- **Significant Data Fiduciaries** (if notified, based on volume and sensitivity): DPO in India, independent audits, DPIAs.
- **Contact:** publish a grievance contact or Data Protection Officer.

## IT Act 2000 and IT Rules 2021 (intermediaries)

- Publish terms, a privacy policy and rules for users; appoint a **Grievance Officer** and publish their name and contact. Acknowledge complaints fast (24 hours) and resolve them within the set period (15 days). Takedown timelines apply for unlawful content.
- **Synthetic / AI-generated content:** the amended IT Rules require **labelling AI-generated audio, video and images** prominently, and platforms enabling such content must embed identifiers or metadata. Label avatars, AI voices and generated images; keep generation logs as proof.
- **CERT-In Directions (2022):** report specified cyber incidents **within 6 hours** of noticing; keep ICT logs for **180 days**, stored in India; sync clocks to NTP.

## Consumer protection

- **Consumer Protection Act 2019** and **E-Commerce Rules 2020** (if you sell to consumers online): show seller identity, a grievance officer, refund/return/cancellation policies, total price including taxes, and no fake reviews.
- **Guidelines for Prevention and Regulation of Dark Patterns, 2023 (CCPA).** Avoid:
  - false urgency
  - basket sneaking
  - confirm-shaming
  - forced action
  - **subscription traps** (cancellation must be as easy as sign-up)
  - interface interference
  - bait and switch
  - drip pricing
  - disguised ads
  - nagging
  - trick wording
  - SaaS billing tricks
  - rogue malware
- **Advertising:** ASCI codes, influencer disclosure (#ad), and no unsubstantiated claims, including about AI ("cures anxiety", "100% accurate").

## Payments and tax

- **RBI e-mandate rules** for recurring card/UPI payments: an additional factor of authentication at registration; a **pre-debit notification** at least 24 hours before each charge; AFA required above a value threshold (₹15,000 for most categories); easy mandate cancellation.
- **GST:** usually 18% on digital services; show tax-inclusive prices to consumers; GST invoices; foreign sellers have OIDAR obligations.
- Use RBI-authorised payment aggregators (Razorpay, Cashfree, PayU…). Never store card data yourself (card-on-file tokenisation rules).

## Marketing communications

- **SMS / voice:** TRAI TCCCPR 2018. Register on **DLT**, register headers and templates, send promotional messages only with recorded consent and outside blocked hours, and honour DND (NCPR). Unregistered commercial SMS gets blocked and penalised.
- **WhatsApp:** explicit opt-in per business, approved templates, and an easy opt-out.
- **Email:** no Indian equivalent of CAN-SPAM, but DPDP consent applies. Always include an unsubscribe link and honour it quickly.

## Content, IP, likeness

- **Copyright Act 1957:** don't use others' text, translations, images, fonts, music or code without a licence; keep a register of sources and licences. Ancient texts are public domain, but **modern editions and translations often aren't**.
- **Personality and publicity rights:** Indian High Courts have repeatedly restrained unauthorised use of celebrities' **names, likeness and voices, including AI voice cloning**. Get a written licence for any real person's voice or face.
- **Religious sentiment:** the Bharatiya Nyaya Sanhita (s.298/299, formerly IPC 295A) criminalises deliberate insult to religious beliefs. Products depicting deities need respectful design, review by people from the tradition, and moderation.
- **Trademarks:** check names and logos (IP India search) before launch.

## Sector-specific (if relevant)

Health (telemedicine guidelines; don't diagnose without registered practitioners), finance (SEBI rules on investment advice, RBI on lending), education for minors, gaming (state laws on real-money games), and mental health (Mental Healthcare Act 2017; never present an app as therapy without clinicians; always show crisis helplines: Tele-MANAS 14416, emergency 112).
