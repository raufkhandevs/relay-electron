import { type ChangeEvent, type KeyboardEvent, useRef, useState } from 'react'
import { formatFileSize } from '../format'
import { ACCEPTED_ATTACHMENT_TYPES } from '../attachment-utils'

// At most one whisper per second, leading edge: the first keystroke of a
// burst fires immediately and the rest are swallowed until the second is up.
const TYPING_THROTTLE_MS = 1000

export default function MessageComposer({
  file,
  onFileChange,
  onFileClear,
  onSend,
  onTyping
}: {
  file: File | null
  onFileChange: (file: File) => void
  onFileClear: () => void
  onSend: (body: string, file: File | null) => void
  onTyping: () => void
}): React.JSX.Element {
  const [body, setBody] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const lastTypingSentAt = useRef(0)
  const trimmed = body.trim()
  // Text, a file, or both. The API requires a body only when no file is present.
  const canSend = trimmed.length > 0 || file !== null

  function submit(): void {
    if (!canSend) {
      return
    }
    onSend(trimmed, file)
    setBody('')
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submit()
    }
  }

  function onBodyChange(event: ChangeEvent<HTMLTextAreaElement>): void {
    setBody(event.target.value)

    const now = Date.now()
    if (now - lastTypingSentAt.current >= TYPING_THROTTLE_MS) {
      lastTypingSentAt.current = now
      onTyping()
    }
  }

  return (
    <div className="composer">
      <div className="composer-row">
        <textarea
          data-testid="composer-body"
          className="composer-input"
          value={body}
          onChange={onBodyChange}
          onKeyDown={onKeyDown}
          placeholder="Write a reply. Enter to send, Shift+Enter for a new line."
          rows={2}
        />
        <input
          ref={fileInputRef}
          type="file"
          data-testid="composer-file-input"
          className="composer-file-input"
          accept={ACCEPTED_ATTACHMENT_TYPES.join(',')}
          onChange={(event) => {
            const selected = event.target.files?.[0]
            if (selected) {
              onFileChange(selected)
            }
            // Reset so picking the same file again after removing it still fires onChange.
            event.target.value = ''
          }}
        />
        <button
          type="button"
          data-testid="composer-attach"
          className="composer-attach"
          onClick={() => fileInputRef.current?.click()}
        >
          Attach
        </button>
        <button
          type="button"
          data-testid="composer-send"
          className="composer-send"
          onClick={submit}
          disabled={!canSend}
        >
          Send
        </button>
      </div>

      {file && (
        <div className="composer-chip" data-testid="composer-file-chip">
          <span className="composer-chip-name">{file.name}</span>
          <span className="composer-chip-size">{formatFileSize(file.size)}</span>
          <button
            type="button"
            data-testid="composer-file-remove"
            className="composer-chip-remove"
            onClick={onFileClear}
            aria-label={`Remove ${file.name}`}
          >
            Remove
          </button>
        </div>
      )}
    </div>
  )
}
