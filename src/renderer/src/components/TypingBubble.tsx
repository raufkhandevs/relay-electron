/**
 * Three dots in a bubble shaped like an incoming message (see
 * docs/decisions/0009-one-design-system-two-densities.md). Rendered as the
 * last <li> in Thread's own message list so the existing scroll-to-bottom
 * behaviour carries it into view like any other message.
 *
 * The dot animation lives in assets/main.css as .typing-dot, staggered here
 * with animationDelay, and held still under prefers-reduced-motion: reduce.
 */
export default function TypingBubble({ name }: { name: string }): React.JSX.Element {
  return (
    <li className="message" data-testid="typing-bubble">
      {/*
       * The dots are decoration and hidden from assistive tech. Without this
       * line a screen reader user gets no indication at all that someone is
       * typing, which is the whole information the bubble carries. Polite, so
       * it waits for a gap rather than interrupting, and it announces once
       * because the component unmounts when typing stops.
       */}
      <span aria-live="polite" className="sr-only">
        {name} is typing
      </span>
      <span className="message-bubble typing-bubble">
        <span aria-hidden className="typing-dot" style={{ animationDelay: '0ms' }} />
        <span aria-hidden className="typing-dot" style={{ animationDelay: '150ms' }} />
        <span aria-hidden className="typing-dot" style={{ animationDelay: '300ms' }} />
      </span>
    </li>
  )
}
