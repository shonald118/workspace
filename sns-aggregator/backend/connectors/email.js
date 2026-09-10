const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');

async function fetchRecentEmails({ limit = 20 } = {}) {
  const client = new ImapFlow({
    host: process.env.EMAIL_IMAP_HOST,
    port: Number(process.env.EMAIL_IMAP_PORT || 993),
    secure: true,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
    logger: false,
  });

  const results = [];
  await client.connect();
  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      const mailbox = client.mailbox;
      const total = mailbox.exists;
      if (total === 0) return results;

      const start = Math.max(1, total - limit + 1);
      for await (const message of client.fetch(`${start}:${total}`, { source: true, uid: true })) {
        const parsed = await simpleParser(message.source);
        results.push({
          source: 'email',
          sender: parsed.from?.text || '',
          title: parsed.subject || '(无主题)',
          content: (parsed.text || '').slice(0, 2000),
          raw_id: String(message.uid),
          received_at: parsed.date ? parsed.date.getTime() : Date.now(),
        });
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }
  return results;
}

module.exports = { fetchRecentEmails };
