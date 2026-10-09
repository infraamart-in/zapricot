import type { ReactNode } from 'react'
import { LEGAL, isPlaceholder } from '../legal'
import { Link } from '../lib/router'
import { SiteFooter } from '../components/SiteFooter'

/** Renders a legal value; placeholders are visibly marked until they are filled in. */
function V({ v }: { v: string }) {
  return isPlaceholder(v) ? <mark className="ph" title="Placeholder — fill in before launch">{v}</mark> : <>{v}</>
}

function Mail() {
  return <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>
}

function Doc({ title, children, onContact }: { title: string; children: ReactNode; onContact: () => void }) {
  return (
    <div className="legal">
      <article className="legal__doc">
        <header className="legal__head">
          <h1 className="legal__title">{title}</h1>
          <p className="legal__date">
            Last updated: <V v={LEGAL.lastUpdated} />
          </p>
        </header>
        {children}
        <p className="legal__back">
          <Link href="/" className="back-link">
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden><path d="M11 7H3m0 0l3.5-3.5M3 7l3.5 3.5" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <span>Back to home</span>
          </Link>
        </p>
      </article>
      <SiteFooter onContact={onContact} />
    </div>
  )
}

export function Privacy({ onContact }: { onContact: () => void }) {
  return (
    <Doc title="Privacy Policy" onContact={onContact}>
      <p className="legal__lede">This is how zapricot handles the little information we collect before launch. Plain English, no surprises.</p>

      <h2>1. Who we are</h2>
      <p>
        <V v={LEGAL.entity} />, {LEGAL.location}. Contact: <Mail />.
      </p>

      <h2>2. What we collect</h2>
      <p>
        Only what you enter in our Early access form (a Google Form): <V v={LEGAL.formFields} />. We also keep what you send us by email.
      </p>
      <p>We don&rsquo;t collect payment details, government IDs or your precise location.</p>

      <h2>3. Why</h2>
      <p>Only to contact you about early access and zapricot updates. We don&rsquo;t sell or rent your data.</p>

      <h2>4. Consent</h2>
      <p>
        We rely on the consent you give by submitting the form. You can withdraw it anytime by emailing <Mail />. Withdrawing doesn&rsquo;t affect anything we did
        before you withdrew.
      </p>

      <h2>5. Who processes it</h2>
      <p>
        Google (Google Forms, which hosts the Early access form) and <V v={LEGAL.hosting} /> (website hosting), only to provide those services to us.
      </p>

      <h2>6. How long we keep it</h2>
      <p>
        Until launch-related communication ends or you ask us to delete it, whichever comes first, and no longer than <V v={LEGAL.retention} />.
      </p>

      <h2>7. Your rights</h2>
      <p>
        You can ask to access, correct, update or delete your data, withdraw consent, and nominate someone to act for you. Email <Mail />. We respond within{' '}
        <V v={LEGAL.responseTime} />.
      </p>

      <h2>8. Grievance contact</h2>
      <p>
        Grievance Officer: <V v={LEGAL.grievanceOfficer} />, <Mail />. If you&rsquo;re unsatisfied with our response, you may approach the Data Protection Board of
        India.
      </p>

      <h2>9. Security</h2>
      <p>We use reasonable safeguards: HTTPS, two-factor-protected accounts and spam protection. No system is 100% secure.</p>

      <h2>10. Children</h2>
      <p>This site isn&rsquo;t intended for anyone under 18, and we don&rsquo;t knowingly collect their data.</p>

      <h2>11. Cookies</h2>
      <p>We don&rsquo;t use advertising or tracking cookies. If we add analytics later, we&rsquo;ll use a cookieless tool and update this section.</p>

      <h2>12. Changes</h2>
      <p>If anything changes, we&rsquo;ll update this page and the date at the top.</p>
    </Doc>
  )
}

export function Terms({ onContact }: { onContact: () => void }) {
  return (
    <Doc title="Terms of Use" onContact={onContact}>
      <p className="legal__lede">The short version: this is a preview of something we&rsquo;re building. Please use it kindly.</p>

      <h2>1. About this site</h2>
      <p>An informational, pre-launch website for zapricot.</p>

      <h2>2. Pre-launch</h2>
      <p>
        Product details, designs, finishes and timelines are indicative and may change. Signing up for early access is not a purchase, a booking, a guarantee of
        availability, or an offer of any financial product.
      </p>

      <h2>3. Intellectual property</h2>
      <p>The zapricot name, logo, card designs, images and content belong to us. Please don&rsquo;t copy or reuse them without our permission.</p>

      <h2>4. Acceptable use</h2>
      <p>No misuse of the site or its forms: no spam, no bots, and no attempts to break or test our security.</p>

      <h2>5. No warranties, limitation of liability</h2>
      <p>The site is provided &ldquo;as is&rdquo;. We&rsquo;re not liable for indirect losses arising from its use.</p>

      <h2>6. Third-party links</h2>
      <p>Links to other sites, such as Instagram, are not under our control.</p>

      <h2>7. Governing law</h2>
      <p>These terms are governed by the laws of India. The courts at Hyderabad, Telangana have jurisdiction.</p>

      <h2>8. Contact</h2>
      <p>
        <Mail />
      </p>
    </Doc>
  )
}
