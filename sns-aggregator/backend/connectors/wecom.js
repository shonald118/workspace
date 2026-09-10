const axios = require('axios');
const crypto = require('crypto');
const xml2js = require('xml2js');

const CORP_ID = process.env.WECOM_CORP_ID;
const AGENT_SECRET = process.env.WECOM_AGENT_SECRET;
const TOKEN = process.env.WECOM_TOKEN;
const AES_KEY_B64 = process.env.WECOM_ENCODING_AES_KEY; // 43位，base64(缺=)

let cachedToken = null;
let cachedTokenExpireAt = 0;

// 获取 access_token（企业微信要求缓存，不要每次都请求，官方限流严格）
async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && now < cachedTokenExpireAt) return cachedToken;

  const url = `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${CORP_ID}&corpsecret=${AGENT_SECRET}`;
  const { data } = await axios.get(url);
  if (data.errcode && data.errcode !== 0) {
    throw new Error(`获取企业微信access_token失败: ${data.errmsg}`);
  }
  cachedToken = data.access_token;
  // 官方有效期7200秒，提前5分钟刷新
  cachedTokenExpireAt = now + (data.expires_in - 300) * 1000;
  return cachedToken;
}

function sha1(...parts) {
  return crypto.createHash('sha1').update(parts.sort().join('')).digest('hex');
}

// 验证签名（GET和POST回调都要验签）
function verifySignature({ signature, timestamp, nonce, echostr = '' }) {
  const calculated = sha1(TOKEN, timestamp, nonce, echostr);
  return calculated === signature;
}

// AES解密回调消息体（企业微信固定用AES-256-CBC，key由EncodingAESKey base64解码而来）
function decryptMessage(encryptedMsg) {
  const aesKey = Buffer.from(AES_KEY_B64 + '=', 'base64'); // 补齐base64 padding
  const iv = aesKey.slice(0, 16);

  const decipher = crypto.createDecipheriv('aes-256-cbc', aesKey, iv);
  decipher.setAutoPadding(false);

  let decrypted = Buffer.concat([
    decipher.update(encryptedMsg, 'base64'),
    decipher.final(),
  ]);

  // 去除PKCS7 padding
  const pad = decrypted[decrypted.length - 1];
  decrypted = decrypted.slice(0, decrypted.length - pad);

  // 结构：random(16B) + msgLen(4B) + msg + corpId
  const msgLen = decrypted.readUInt32BE(16);
  const msg = decrypted.slice(20, 20 + msgLen).toString('utf8');
  return msg;
}

// 把解密后的XML转成标准消息对象
async function parseXmlMessage(xml) {
  const parsed = await xml2js.parseStringPromise(xml, { explicitArray: false });
  const m = parsed.xml;
  return {
    source: 'wecom',
    sender: m.FromUserName || '',
    title: `[企业微信] ${m.MsgType || ''}`,
    content: m.Content || m.Recognition || JSON.stringify(m),
    raw_id: m.MsgId || `${m.FromUserName}_${m.CreateTime}`,
    received_at: Number(m.CreateTime) * 1000 || Date.now(),
  };
}

module.exports = { getAccessToken, verifySignature, decryptMessage, parseXmlMessage };
