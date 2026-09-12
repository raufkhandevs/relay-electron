import { useEffect, useState } from 'react'
import { formatFileSize } from '../format'
import { bytesToBase64 } from '../attachment-utils'
import type { Attachment } from '../../../shared/types'

/**
 * Renders inline at agent density. Fetched fresh through relay.attachmentBytes on
 * mount rather than held as a URL: main resolves the presigned redirect and hands
 * back bytes, which become a data: URI here so the renderer never sees, and so
 * never has to hold, a link to the object store.
 */
export function ImageAttachment({ attachment }: { attachment: Attachment }): React.JSX.Element {
  const [src, setSrc] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    // No manual reset needed: the message list keys each attachment by id, so a
    // different attachment.id is a fresh component instance with fresh state.
    let cancelled = false
    window.relay
      .attachmentBytes(attachment.id)
      .then((bytes) => {
        if (!cancelled) {
          setSrc(`data:${attachment.mime};base64,${bytesToBase64(bytes)}`)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [attachment.id, attachment.mime])

  if (failed) {
    return (
      <span className="attachment-error" data-testid={`attachment-error-${attachment.id}`}>
        Could not load {attachment.original_name}
      </span>
    )
  }

  if (!src) {
    return <span className="attachment-image-loading" aria-hidden="true" />
  }

  return (
    <img
      src={src}
      alt={attachment.original_name}
      className="attachment-image"
      data-testid={`attachment-image-${attachment.id}`}
    />
  )
}

/** Any non-image type: a labelled row that fetches and downloads on click. */
export function FileAttachment({ attachment }: { attachment: Attachment }): React.JSX.Element {
  const [failed, setFailed] = useState(false)

  async function open(): Promise<void> {
    setFailed(false)
    try {
      const bytes = await window.relay.attachmentBytes(attachment.id)
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: attachment.mime }))
      const link = document.createElement('a')
      link.href = url
      link.download = attachment.original_name
      link.click()
      URL.revokeObjectURL(url)
    } catch {
      setFailed(true)
    }
  }

  return (
    <button
      type="button"
      className="attachment-file-row"
      onClick={open}
      data-testid={`attachment-file-${attachment.id}`}
    >
      <span className="attachment-file-name">{attachment.original_name}</span>
      <span className="attachment-file-size">{formatFileSize(attachment.size_bytes)}</span>
      {failed && <span className="attachment-file-error">Could not open</span>}
    </button>
  )
}
