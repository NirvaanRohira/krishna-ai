// What can be bought, at what price. The server is the only source of prices: the client
// sends a product id, never an amount. Change prices here (and in the pricing page copy).
//
// These are one-time passes, not subscriptions: nothing renews on its own, so there is no
// surprise debit and nothing to cancel. Buying again extends the current plan.

export type Product = {
  id: string
  plan: 'plus' | 'premium'
  days: number
  /** Price in paise (₹1 = 100 paise), inclusive of any applicable taxes. */
  amountPaise: number
  label: string
}

export const PRODUCTS: Product[] = [
  { id: 'plus_30', plan: 'plus', days: 30, amountPaise: 199_00, label: 'Plus · 30 days' },
  { id: 'plus_365', plan: 'plus', days: 365, amountPaise: 1_499_00, label: 'Plus · 1 year' },
  { id: 'premium_30', plan: 'premium', days: 30, amountPaise: 499_00, label: 'Premium · 30 days' },
]

export function findProduct(id: unknown): Product | undefined {
  return typeof id === 'string' ? PRODUCTS.find((p) => p.id === id) : undefined
}

export function rupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN')}`
}
