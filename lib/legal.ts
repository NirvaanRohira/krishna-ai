// Versions of the legal documents a user consents to. Bump a version whenever the text
// changes materially; users whose stored version is older are asked to re-consent.
export const TERMS_VERSION = '2026-10-31-draft'
export const PRIVACY_VERSION = '2026-10-31-draft'
export const AI_DISCLOSURE_VERSION = '2026-10-31'

// DPDP Act requires a named contact for grievances. Fill these in before launch.
export const GRIEVANCE_OFFICER = {
  name: process.env.NEXT_PUBLIC_GRIEVANCE_OFFICER_NAME || '[Grievance Officer name — set before launch]',
  email: process.env.NEXT_PUBLIC_GRIEVANCE_EMAIL || 'grievance@[your-domain]',
}

export const MIN_AGE = 18
