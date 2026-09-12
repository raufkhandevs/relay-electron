import { app, safeStorage } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'fs'

// Main-process only. Nothing here is reachable from the renderer: there is no IPC
// channel that returns a token, only ones that consume it internally (see ipc.ts).

const TOKEN_FILE = (): string => join(app.getPath('userData'), 'auth.token')

function requireEncryption(): void {
  if (!safeStorage.isEncryptionAvailable()) {
    // Failing loudly beats silently writing the bearer token to disk in plaintext.
    throw new Error(
      'safeStorage encryption is not available on this machine; refusing to store the auth token.'
    )
  }
}

export function getToken(): string | null {
  const path = TOKEN_FILE()
  if (!existsSync(path)) {
    return null
  }
  requireEncryption()
  const ciphertext = readFileSync(path)
  return safeStorage.decryptString(ciphertext)
}

export function setToken(token: string): void {
  requireEncryption()
  const ciphertext = safeStorage.encryptString(token)
  writeFileSync(TOKEN_FILE(), ciphertext)
}

export function clearToken(): void {
  const path = TOKEN_FILE()
  if (existsSync(path)) {
    unlinkSync(path)
  }
}
