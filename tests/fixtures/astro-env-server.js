// Test-only shim for Astro's virtual module. Production uses astro:env/server.
export const getSecret = (name) => process.env[name]
