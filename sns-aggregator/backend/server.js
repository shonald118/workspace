require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const cron = require('node-cron');

const { insertMessage, listMessages, markRead } = require('./db');
const wecom = require('./connectors/wecom');
const dingtalk = require('./connectors/dingtalk');
const { fetchRecentEmails } = require('./connectors/email');

const app = express();
app.use(bodyParser.text({ type: '*/xml' }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// ===== 企业微信回调 =====
// 配置回调地址时，企业微信会先发一个GET请求验证URL有效性
app.get('/callback/wecom', (req, res) => {
  const { msg_signature, timestamp, nonce, echostr } = req.query;
  if (!wecom.verifySignature({ signature: msg_signature, timestamp, nonce, echostr })) {
    return res.status(401).send('签名验证失败');
  }
  const decrypted = wecom.decryptMessage(echostr);
  res.send(decrypted);
});

// 真实消息推送走POST
app.post('/callback/wecom', async (req, res) => {
  try {
    const { msg_signature, timestamp, nonce } = req.query;
    // 企业微信POST body是XML，里面包一层<Encrypt>字段
    const encryptMatch = req.body.match(/<Encrypt><!\[CDATA\[(.*)\]\]><\/Encrypt>/);
    const encrypted = encryptMatch ? encryptMatch[1] : null;
    if (!encrypted || !wecom.verifySignature({ signature: msg_signature, timestamp, nonce, echostr: encrypted })) {
      return res.status(401).send('签名验证失败');
    }
    const xml = wecom.decryptMessage(encrypted);
    const message = await wecom.parseXmlMessage(xml);
    insertMessage(message);
    res.send('success');
  } catch (err) {
    console.error('处理企业微信回调出错:', err);
    res.status(500).send('error');
  }
});

// ===== 钉钉：Stream模式，不需要公网回调地址 =====
// 只要 .env 里配置了 DINGTALK_APP_KEY / DINGTALK_APP_SECRET 就会自动启动
dingtalk.startDingtalkStream((message) => {
  insertMessage(message);
  console.log('[dingtalk] 收到新消息:', message.title, message.content?.slice(0, 30));
});

// ===== 邮箱：定时轮询（IMAP没有回调机制，只能轮询）=====
async function pollEmail() {
  try {
    const emails = await fetchRecentEmails({ limit: 20 });
    emails.forEach(insertMessage);
    console.log(`[email] 轮询完成，拉取到 ${emails.length} 封邮件`);
  } catch (err) {
    console.error('邮箱轮询失败:', err.message);
  }
}
// 每5分钟拉一次，可根据需要调整
cron.schedule('*/5 * * * *', pollEmail);

// ===== 给前端用的聚合API =====
app.get('/api/messages', (req, res) => {
  const { source, limit, offset } = req.query;
  const messages = listMessages({
    source,
    limit: limit ? Number(limit) : 50,
    offset: offset ? Number(offset) : 0,
  });
  res.json(messages);
});

app.post('/api/messages/:id/read', (req, res) => {
  markRead(req.params.id);
  res.json({ ok: true });
});

app.post('/api/email/sync-now', async (req, res) => {
  await pollEmail();
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`聚合工具已启动: http://localhost:${PORT}`);
  console.log(`企业微信回调地址: ${process.env.PUBLIC_BASE_URL || '<你的公网地址>'}/callback/wecom`);
  console.log(`钉钉回调地址: ${process.env.PUBLIC_BASE_URL || '<你的公网地址>'}/callback/dingtalk`);
});
