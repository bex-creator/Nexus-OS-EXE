# Nexus Mail Worker

This Worker is the real receiving backend for the Nexus Mail app.

## What it provides

- Real `username@your-domain.com` Nexus mailboxes.
- `username+website@your-domain.com` aliases (the Worker normalizes the `+` part).
- Firebase-authenticated mailbox creation and inbox access.
- MIME parsing with PostalMime.
- D1-backed message storage.
- Verification links surfaced by the Nexus Mail desktop app.

## One-time setup

1. Own a domain you want to use for Nexus Mail and put its DNS on Cloudflare. Cloudflare Email Routing requires the domain to be onboarded to Cloudflare.
2. Create a D1 database named `nexus-mail` and put its database ID into `wrangler.toml`.
3. Run the SQL in `schema.sql` against the D1 database.
4. Put the Firebase web API key for the Nexus Firebase project into `FIREBASE_API_KEY` in `wrangler.toml` (or use a Worker secret).
5. Replace `MAIL_DOMAIN` with your real domain.
6. Install dependencies and deploy the Worker with Wrangler.
7. In Cloudflare Email Service, route `*@YOUR-NEXUS-DOMAIN.COM` to this Worker. Cloudflare supports routing inbound email to a Worker and plus/subaddressing.
8. In Nexus Mail, enter the Worker URL and the same mail domain.

Cloudflare's current Email Service docs document Worker `email()` handlers, inbound routing, and plus addressing. See:
https://developers.cloudflare.com/email-service/api/route-emails/email-handler/
https://developers.cloudflare.com/email-service/configuration/email-routing-addresses/
