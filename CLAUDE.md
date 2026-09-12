# Relay agent console

Electron, electron-vite, React 19, TypeScript. Desktop client for the Relay support desk. Design
and decision records live in the parent repo, `raufkhandevs/relay`, under `docs/`.

The API is `relay-laravel` and must be running. Response shapes are mirrored in
`src/shared/types.ts`.

## Non-negotiable

- **`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.** Never "just for
  development". Turning any of them off converts a renderer XSS into filesystem and process access.
- **The token lives in main and never crosses to the renderer.** `signIn` returns only the `User`.
  If you find yourself passing a token over IPC, the design has been broken.
- **The `contextBridge` surface stays narrow, named and typed.** Never expose `ipcRenderer`. Never
  add `invoke(channel, ...args)`. Each method maps to exactly one channel. The electron-vite
  template's `@electron-toolkit/preload` shipped exactly that hole and was removed; do not
  reintroduce it.
- **Main validates every IPC payload.** `ticketId` is a positive integer, `channelName` matches
  `private-ticket.<digits>`. The renderer is a browser: treat it like a public HTTP endpoint.
- **Writes go to `app.getPath('userData')`**, never inside the app bundle.
- **Nothing secret ships in the bundle.** `npx asar extract app.asar out/` reads all of it. The
  Reverb app key is public by design; the Reverb secret never appears here.

## Conventions

- `API_BASE` and the Reverb app key are hardcoded on purpose. This is a single-environment dev
  client and neither value changes; config for a value that never changes is config in three
  places waiting to disagree.
- Echo uses a custom authorizer routing through `relay:channelAuth`. Never switch it to the default
  authorizer, which would require the token in the renderer.
- Interactive elements carry `data-testid` so automation addresses them by identity, not position.
- Errors from the API must carry Laravel's JSON `message` through to the renderer. Custom `Error`
  properties do not survive the IPC boundary, so main extracts the message before throwing.

## Never

- Commit `.env`, `out/` or `dist/`.
- Run `git push`. Rauf pushes, always. Commit locally and hand him the command.
- Add code whose only purpose is to let an agent drive the UI.
- Widen the bridge to make a renderer feature easier.
