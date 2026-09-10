const DWClient = require('dingtalk-stream-sdk-nodejs');

const APP_KEY = process.env.DINGTALK_APP_KEY;
const APP_SECRET = process.env.DINGTALK_APP_SECRET;

let client = null;

// Stream模式：长连接由SDK内部维护，不需要公网HTTPS地址，非常适合先在本机试验
// 前提：在钉钉开发者后台 -> 你的应用 -> 应用能力 -> 机器人，把"消息接收模式"选成"Stream模式"并发布
function startDingtalkStream(onMessage) {
  if (!APP_KEY || !APP_SECRET) {
    console.warn('[dingtalk] 未配置 DINGTALK_APP_KEY / DINGTALK_APP_SECRET，跳过启动');
    return null;
  }

  client = new DWClient({
    clientId: APP_KEY,
    clientSecret: APP_SECRET,
  });

  // 机器人收到的私聊/群@消息，走这个回调
  client.registerCallbackListener('/v1.0/im/bot/messages/get', async (res) => {
    try {
      const { text, senderStaffId, senderNick, msgId, conversationType } = JSON.parse(res.data);
      onMessage({
        source: 'dingtalk',
        sender: senderNick || senderStaffId || '',
        title: `[钉钉]${conversationType === '1' ? '私聊' : '群消息'}`,
        content: text?.content || '',
        raw_id: msgId || `${senderStaffId}_${Date.now()}`,
        received_at: Date.now(),
      });
    } catch (err) {
      console.error('[dingtalk] 解析消息失败:', err);
    }

    // 必须按SDK要求回一个ack，否则钉钉会重复推送
    return { status: 'SUCCESS', message: 'OK' };
  });

  client.connect();
  console.log('[dingtalk] Stream模式已连接，等待消息...');
  return client;
}

module.exports = { startDingtalkStream };
