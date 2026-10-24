# Product

## Register

product

## Users

Maleem serves individuals in Egypt who want a lower-friction way to understand
their money across cash, bank accounts, digital wallets, recurring obligations,
budgets, foreign currencies, and metal savings. They may think and speak in
Arabic, English, or a mix of both. They often move money through cash, banks,
telecom wallets, InstaPay-led flows, USD savings, and gold or other precious
metals.

The primary user context is mobile, personal, and repeated: a user is checking
balances, adding an account, reviewing an SMS-detected transaction, correcting
an automated suggestion, or entering expenses quickly before they forget. The
interface must support users who are offline, users who are in a hurry, and
users who are cautious about financial privacy.

The product is not for anonymous guest tracking. Private financial workflows
belong behind authenticated routing, but local offline data must still be scoped
to the current user because local rows may remain on the device after logout.

## Product Purpose

Maleem is an authenticated, offline-first personal finance companion for the
Egyptian market. It tracks spendable money, transactions, budgets, recurring
payments, debts, digital wallets, bank balances, and metal holdings while using
voice and SMS automation to reduce boring manual entry.

The product exists because traditional finance apps ask users to type too much.
Maleem should let users capture financial activity through the signals they
already have: spoken notes, bank and wallet SMS messages, account balances, and
everyday Arabic/English financial language.

Success means users can trust Maleem as a fast daily money companion: it works
offline, writes locally first, clearly separates automation from review, shows
financial state without confusion, and never asks for sensitive credentials such
as full card numbers, PINs, or passwords.

The approved user-facing names are **Maleem** in English and **مليم** in Arabic. Internal technical identifiers remain unchanged for existing-install continuity. The current logo is retained until owner selection.

## Brand Personality

Maleem should feel calm, trustworthy, practical, and quietly premium. Its
personality is: **clear**, **capable**, and **grounded**.

The voice should be friendly and direct, especially around permissions,
automation, and errors. It should never blame the user, expose technical
implementation details, or make financial workflows feel risky. It should make
the user feel in control: automation helps, but the user decides.

The interface should feel modern without becoming decorative. Familiar mobile
finance patterns are allowed and often preferred, because the user is trying to
finish a task, not admire a visual experiment. Delight belongs in small moments
of confidence, feedback, and reduced effort.

## Anti-references

Maleem should not look or behave like:

- A generic fintech dashboard with navy-and-gold cliches.
- A crypto app, trading app, or speculative wealth product.
- A SaaS landing page disguised as an app screen.
- A decorative AI-generated interface with glassmorphism, gradient orbs, heavy
  purple-blue gradients, or visual effects that do not serve the task.
- A form that hides required financial meaning behind clever layout or unclear
  labels.
- A banking clone that feels institutional, cold, or intimidating.
- An MVP utility app with inconsistent controls, weak spacing, raw system
  alerts, or incomplete dark mode.
- A workflow that silently trusts automation without making review, correction,
  and undo paths understandable.

## Design Principles

1. **Local-first confidence.** Every screen should feel usable even when sync is
   not finished. Skeletons, local reads, and recoverable states should reinforce
   trust instead of making the app feel blocked by the network.

2. **Automation with review.** Voice and SMS should reduce typing, but financial
   records should remain inspectable before they affect the user's money model
   unless the user has explicitly opted into auto-confirm behavior.

3. **Three-second comprehension.** Core flows, especially account setup,
   transaction review, and balance screens, must be understandable almost
   immediately. Labels, grouping, and progressive disclosure should beat
   explanatory paragraphs.

4. **Financial data deserves calm hierarchy.** Balances, account identity,
   currency, sender metadata, and destructive actions should have clear visual
   priority. Decoration must not compete with money values or form completion.

5. **Egyptian context without narrowness.** The app should feel built for
   Egyptian financial behavior, Arabic/English usage, local banks, wallets, EGP,
   gold, and SMS automation, while still supporting users who track foreign
   currencies or use providers outside preset lists.

## Accessibility & Inclusion

Maleem supports English and Arabic, including RTL layout. Arabic text should use
Noto Sans Arabic; English and LTR UI should use Inter. Search and matching
experiences that involve Egyptian institutions should respect both English and
Arabic provider names when metadata exists.

The UI should target at least WCAG AA contrast for text and controls. Color must
not be the only signal for account type, state, error, or selection. All
interactive controls need clear accessible labels, visible focus or pressed
states where the platform exposes them, and adequate touch targets.

Motion should be restrained and state-driven. Users who prefer reduced motion
should not be forced through decorative animation. Loading states for content
should use skeletons rather than spinners, with short action progress reserved
for buttons or already-visible content.

Financial safety copy must be plain-language and reassuring. Permission and SMS
automation flows should use Maleem-owned explanatory UI before system prompts or
settings handoffs.
