# ADR 0003: Same-origin BFF and public ISR

Status: Accepted — Phase 3

Browser traffic uses the Next.js `/api/backend/*` route handler. The BFF forwards only approved headers, preserves the HttpOnly refresh cookie and correlation ID, and hides the internal API address. Public catalog pages fetch server-side and use five-minute ISR; authenticated screens use the centralized browser client.

Consequences: browser CORS and cookie behavior are simpler, public pages ship less JavaScript, and API endpoint topology is not exposed to the client bundle.
