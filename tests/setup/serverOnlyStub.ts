/**
 * Stand-in for the `server-only` marker package.
 *
 * The real module throws the moment it is imported outside a React Server
 * Component, which is exactly what we want in the app and exactly what would
 * break a Vitest run of any server module. Vitest already runs on the server,
 * so the marker is a no-op here. Aliased in vitest.config.ts.
 */
export {};
