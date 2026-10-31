// Kanha's mark: a peacock-feather eye (morpankh) drawn in a single stroke weight.
export function Mark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <path d="M24 45V27" />
      <path d="M24 27c-9-2-14-9-12-16C14 5 20 3 24 3s10 2 12 8c2 7-3 14-12 16Z" />
      <path d="M24 23c-5-1.2-7.6-5-6.6-8.8C18.3 11 21 9.5 24 9.5s5.7 1.5 6.6 4.7c1 3.8-1.6 7.6-6.6 8.8Z" />
      <path d="M24 18.5c-1.9-.5-2.8-1.9-2.4-3.2.3-1.1 1.2-1.7 2.4-1.7s2.1.6 2.4 1.7c.4 1.3-.5 2.7-2.4 3.2Z" fill="currentColor" />
      <path d="M12.5 15 7 13M35.5 15 41 13M13.5 21 8.5 22M34.5 21l5 1" opacity="0.6" />
    </svg>
  )
}
