import PostalMime from "postal-mime";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Cache-Control": "no-store",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function normalizeLocalPart(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\+.*/, "")
    .replace(/[^a-z0-9._-]/g, "")
    .slice(0, 64);
}

async function verifyFirebaseToken(request, env) {
  const header = request.headers.get("authorization") || "";
  if (!header.toLowerCase().startsWith("bearer ")) throw new Error("Missing Firebase token");
  const idToken = header.slice(7).trim();
  if (!idToken) throw new Error("Missing Firebase token");

  const url = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(env.FIREBASE_API_KEY)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  if (!response.ok) throw new Error("Firebase token validation failed");
  const data = await response.json();
  const user = data?.users?.[0];
  if (!user?.localId) throw new Error("Invalid Firebase token");
  return { uid: user.localId, email: user.email || "" };
}

async function handleMailbox(request, env) {
  let identity;
  try {
    identity = await verifyFirebaseToken(request, env);
  } catch (error) {
    return json({ error: error?.message || "Unauthorized" }, 401);
  }

  const body = await request.json().catch(() => ({}));
  let localPart = normalizeLocalPart(body.localPart);
  const desired = localPart;
  if (localPart.length < 2) return json({ error: "Invalid mailbox name" }, 400);

  const existing = await env.DB.prepare(
    "SELECT local_part, user_id FROM mailboxes WHERE local_part = ?"
  ).bind(localPart).first();

  if (existing && existing.user_id !== identity.uid) {
    const suffix = identity.uid.slice(0, 7).toLowerCase();
    localPart = `${desired.slice(0, Math.max(2, 64 - suffix.length - 1))}-${suffix}`;
  }

  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO mailboxes(local_part, user_id, created_at)
     VALUES(?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET local_part = excluded.local_part`
  ).bind(localPart, identity.uid, now).run();

  return json({
    localPart,
    address: `${localPart}@${env.MAIL_DOMAIN}`,
  });
}

async function handleInbox(request, env) {
  let identity;
  try {
    identity = await verifyFirebaseToken(request, env);
  } catch (error) {
    return json({ error: error?.message || "Unauthorized" }, 401);
  }

  const url = new URL(request.url);
  const localPart = normalizeLocalPart(url.searchParams.get("mailbox"));
  if (!localPart) return json({ error: "Mailbox is required" }, 400);

  const mailbox = await env.DB.prepare(
    "SELECT local_part FROM mailboxes WHERE local_part = ? AND user_id = ?"
  ).bind(localPart, identity.uid).first();
  if (!mailbox) return json({ error: "Mailbox not found for this Nexus account" }, 404);

  const rows = await env.DB.prepare(
    `SELECT id, from_addr as "from", subject, text_body as bodyText,
            html_body as bodyHtml, received_at as receivedAt
       FROM messages
      WHERE mailbox = ?
      ORDER BY received_at DESC
      LIMIT 100`
  ).bind(localPart).all();

  return json({
    mailbox: `${localPart}@${env.MAIL_DOMAIN}`,
    messages: rows.results || [],
  });
}

async function handleApi(request, env) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  const url = new URL(request.url);

  if (url.pathname === "/api/health") return json({ ok: true, service: "nexus-mail" });
  if (url.pathname === "/api/mailbox" && request.method === "POST") return handleMailbox(request, env);
  if (url.pathname === "/api/inbox" && request.method === "GET") return handleInbox(request, env);

  return json({ error: "Not found" }, 404);
}

export default {
  async fetch(request, env) {
    try {
      return await handleApi(request, env);
    } catch (error) {
      return json({ error: error?.message || "Nexus Mail service error" }, 500);
    }
  },

  async email(message, env, ctx) {
    const localPart = normalizeLocalPart(message.to.split("@")[0]);
    if (!localPart) {
      message.setReject("Invalid Nexus mailbox");
      return;
    }

    const mailbox = await env.DB.prepare(
      "SELECT local_part FROM mailboxes WHERE local_part = ?"
    ).bind(localPart).first();

    if (!mailbox) {
      message.setReject("Mailbox does not exist");
      return;
    }

    try {
      const parsed = await PostalMime.parse(message.raw);
      const id = crypto.randomUUID();
      const messageId = message.headers.get("message-id") || id;
      const subject = parsed.subject || message.headers.get("subject") || "";
      const textBody = parsed.text || "";
      const htmlBody = parsed.html || "";

      await env.DB.prepare(
        `INSERT OR IGNORE INTO messages
         (id, mailbox, message_id, from_addr, subject, text_body, html_body, received_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        id,
        localPart,
        messageId,
        message.from || "unknown",
        subject.slice(0, 500),
        textBody.slice(0, 500000),
        htmlBody.slice(0, 1000000),
        Date.now()
      ).run();
    } catch (error) {
      console.error("Nexus Mail parse/store failure", error);
      message.setReject("Could not process message");
    }
  },
};
