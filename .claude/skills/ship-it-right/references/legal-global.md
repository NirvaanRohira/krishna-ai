# Legal and policy: US, EU / UK, global ("how not to get sued")

Not legal advice. The usual ways small products get sued or fined, and how to avoid each.

## The founder's minimum legal kit

- [ ] **Terms of Service:** licence to use, acceptable use, IP ownership of user content, disclaimers, limitation of liability, governing law and venue, dispute process, termination, changes clause.
- [ ] **Privacy Policy** matching what the code *actually* does: data collected, purposes, processors, retention, rights, contact, transfers. Out-of-date policies are a common enforcement hook.
- [ ] **Cookie / tracking notice** and a consent tool where required (EU/UK).
- [ ] **Refund and cancellation policy** if you charge.
- [ ] **AI disclosure / AI use policy** if you use AI (see `ai-products.md`).
- [ ] **Accessibility statement** (and an actual accessible product).
- [ ] **Contact, grievance and legal notices address**; a company entity (don't operate as an individual).
- [ ] **Open-source licence compliance:** keep a list of dependencies and their licences. GPL/AGPL code in a SaaS can carry obligations. Credit MIT/Apache notices where required.
- [ ] **Content licences** for fonts, images, icons, music, datasets and corpora, recorded in a register.
- [ ] **Trademark search** on the product name in each launch market.

## United States

- **COPPA:** collecting personal data from **under-13s** requires verifiable parental consent. Age-gate or design for kids deliberately.
- **CAN-SPAM:** commercial email needs accurate headers, a physical address, a clear **unsubscribe** honoured within 10 business days, and no deceptive subjects.
- **TCPA:** texts and calls need prior express written consent. Statutory damages per message make class actions common.
- **DMCA:** if users can upload or share content, register a **DMCA designated agent** with the US Copyright Office (renew every 3 years) and run notice-and-takedown, or you lose the safe harbour.
- **ADA (Title III):** web accessibility lawsuits are frequent. Meet WCAG 2.1 AA.
- **State privacy laws** (California CCPA/CPRA and many others): notice at collection, "Do Not Sell or Share" plus honouring Global Privacy Control, sensitive-data limits, deletion and access rights.
- **Biometrics:** Illinois **BIPA** (and Texas, Washington) requires written notice and consent before collecting face geometry or voiceprints. **Face ID / face recognition without consent** is one of the most expensive mistakes (per-person statutory damages).
- **FTC:**
  - no deceptive claims, including **AI capability claims**
  - no fake or AI-generated reviews (2024 rule)
  - "click-to-cancel"-style easy cancellation
  - data security reasonable for the data you hold
- **Wiretap / pixel suits:** session replay and chat recording without consent, and the **Meta Pixel** on pages with sensitive information (health, video viewing under the VPPA), have driven many class actions.

## European Union / UK

- **GDPR / UK GDPR:**
  - a lawful basis for each purpose
  - consent that's granular and freely given
  - a DPA with each processor
  - a ROPA
  - a DPIA for high-risk processing
  - data subject rights within a month
  - **breach notification to the authority within 72 hours**
  - transfer mechanisms for data leaving the EU (SCCs or the DPF)
  - an EU representative if you're not established there
- **ePrivacy / cookies:** **no non-essential cookies or trackers (analytics, ads, Meta Pixel, TikTok pixel) before opt-in consent**; "reject all" as easy as "accept all"; no pre-ticked boxes.
- **EU AI Act:** transparency duties (people must know they're talking to an AI; **AI-generated or manipulated content and deepfakes must be labelled**), prohibited practices, and obligations for high-risk uses. Applies to providers serving EU users; obligations phase in through 2026–27.
- **Digital Services Act:** notice-and-action for illegal content, transparency for platforms, and no dark patterns.
- **Consumer law:** a 14-day withdrawal right for digital purchases (unless expressly waived on supply), clear pricing, and easy cancellation.
- **Age:** member states set the digital consent age between 13 and 16.

## App stores

See `mobile.md` (account deletion inside the app, privacy labels, in-app purchase rules).
