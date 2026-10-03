CREATE TABLE IF NOT EXISTS mailboxes (
  local_part TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  mailbox TEXT NOT NULL,
  message_id TEXT,
  from_addr TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  text_body TEXT NOT NULL DEFAULT '',
  html_body TEXT NOT NULL DEFAULT '',
  received_at INTEGER NOT NULL,
  UNIQUE(mailbox, message_id)
);

CREATE INDEX IF NOT EXISTS idx_messages_mailbox_received
  ON messages(mailbox, received_at DESC);
