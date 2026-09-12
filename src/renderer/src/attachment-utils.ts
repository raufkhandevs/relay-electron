/**
 * Convenience filter only for the file picker dialog; the real bound is
 * StoreMessageRequest::ALLOWED_ATTACHMENT_MIMES on the server, mirrored again in
 * src/main/ipc.ts for a fast local rejection.
 */
export const ACCEPTED_ATTACHMENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/pdf',
  'text/plain'
]

/** No Buffer in a sandboxed renderer; chunked to stay under btoa's argument limits. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}
