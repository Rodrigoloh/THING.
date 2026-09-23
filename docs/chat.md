# Chat V1

`/thing/[thingId]/chat` is a private chronological text conversation. Messages contain `thing_id`, author, trimmed body and creation time. Bodies are 1–2,000 characters. The UI polls every five seconds and refresh persistence comes from `chat_messages`.

RLS allows active Thing members to read and insert. The author is derived from `auth.uid()` and outsiders receive no rows. V1 intentionally omits reactions, attachments, voice notes, typing indicators, read receipts and threads.
