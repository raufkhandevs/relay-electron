import { type KeyboardEvent, useState } from 'react'

export default function MessageComposer({
  onSend
}: {
  onSend: (body: string) => void
}): React.JSX.Element {
  const [body, setBody] = useState('')
  const trimmed = body.trim()

  function submit(): void {
    if (!trimmed) {
      return
    }
    onSend(trimmed)
    setBody('')
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submit()
    }
  }

  return (
    <div className="composer">
      <textarea
        data-testid="composer-body"
        className="composer-input"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Write a reply. Enter to send, Shift+Enter for a new line."
        rows={2}
      />
      <button
        type="button"
        data-testid="composer-send"
        className="composer-send"
        onClick={submit}
        disabled={!trimmed}
      >
        Send
      </button>
    </div>
  )
}
