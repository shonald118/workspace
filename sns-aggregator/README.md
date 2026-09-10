# 消息聚合 Workspace

把企业微信、钉钉、邮箱的消息统一收进一个界面。

> ⚠️ 重要提醒：企业微信、钉钉的开放平台接口偶尔会调整（字段、接口地址、加解密细节），
> 部署前请对照官方最新文档核实一遍，本项目中的连接器代码是按当前公开文档标准写的，
> 但不保证100%匹配你部署时刻的最新版本。

## 〇、先只跑通钉钉（推荐的第一步）

钉钉这块改成了官方 **Stream 模式**（长连接推送），好处是**不需要公网地址、不需要ngrok**，在你自己电脑上就能跑通，非常适合先试验。

1. 登录 [钉钉开放平台](https://open-dev.dingtalk.com/)，「应用开发」-「创建应用」（选"企业内部开发"）
2. 应用详情页「凭证与基础信息」，记下 **AppKey (ClientID)** 和 **AppSecret (ClientSecret)**
3. 左侧「应用能力」-「添加应用能力」-选择「机器人」，填基本信息，**消息接收模式一定要选"Stream模式"**，保存并发布
4. 「版本管理与发布」里点"确认发布"，可见范围选"全部员工"（或按需选择）
5. 回到本地项目：
   ```bash
   npm install
   cp .env.example .env
   ```
   打开 `.env`，只需要填这两行就够了：
   ```
   DINGTALK_APP_KEY=你的AppKey
   DINGTALK_APP_SECRET=你的AppSecret
   ```
6. 启动服务：
   ```bash
   npm start
   ```
   看到 `[dingtalk] Stream模式已连接，等待消息...` 就说明连上了
7. 回钉钉开放平台，应用详情页找「机器人」-「点击调试」，创建一个测试群，在群里@这个机器人发条消息
8. 浏览器打开 `http://localhost:3000`，应该能看到刚才发的消息出现在聚合界面里

企业微信和邮箱那部分先不用管，等钉钉这条链路跑通了，你熟悉了整个流程之后再接入也不迟。

## 一、整体架构

```
企业微信/钉钉服务器 --(消息回调,需要公网HTTPS地址)--> 本服务 /callback/xxx --> 写入本地数据库
邮箱IMAP服务器      --(每5分钟轮询拉取)--------------> 本服务定时任务   --> 写入本地数据库
                                                              |
                                                              v
                                                     前端页面读取 /api/messages 展示
```

## 二、准备工作：注册应用拿密钥

### 1. 企业微信

1. 登录 [企业微信管理后台](https://work.weixin.qq.com/wework_admin)（需要是企业管理员账号）
2. 左侧「我的企业」-「企业信息」，记下 **企业ID（CorpID）**
3. 左侧「应用管理」-「自建」-「创建应用」，创建一个应用（比如叫"消息聚合"）
4. 进入刚创建的应用详情页，记下 **AgentId** 和 **Secret**
5. 同一页面找到「接收消息」-「设置API接收」：
   - 这里需要先填一个**能被公网访问的回调地址**，格式：`https://你的域名/callback/wecom`
   - 系统会自动生成 **Token** 和 **EncodingAESKey**，记下来
   - ⚠️ 这一步必须等你的服务已经跑起来、且能被公网访问后才能验证通过，所以建议先完成"三、部署"再回来配置这里

### 2. 钉钉

1. 登录 [钉钉开放平台](https://open-dev.dingtalk.com/)
2. 「应用开发」-「企业内部开发」-「创建应用」
3. 应用详情页「凭证与基础信息」，记下 **AppKey** 和 **AppSecret**
4. 「应用能力」里添加「机器人」能力，消息接收模式选 **Stream模式**（本项目用的就是这种，不需要配置回调地址），发布应用

详细步骤见上面"〇、先只跑通钉钉"。

### 3. 企业邮箱

- 大部分企业邮箱（腾讯企业邮、阿里企业邮等）需要在邮箱设置里单独开启"IMAP/SMTP服务"并生成
  **客户端专用授权码**（不是登录密码），把这个授权码填到 `.env` 的 `EMAIL_PASSWORD`

## 三、部署步骤

### 方式A：一键部署到云平台（推荐，几分钟拿到真实网址，不用自己管服务器）

项目已经配好了 `railway.json` / `render.yaml` / `Procfile`，支持 [Railway](https://railway.app) 或 [Render](https://render.com) 直接从代码仓库部署。

**⚠️ 重要限制**：这两个平台的免费/入门套餐文件系统是**临时的**——每次重新部署或者服务重启，本地的 `data.sqlite` 数据库文件会被清空，历史消息会丢失。这对"先试验能不能跑通"完全够用，但如果之后要长期稳定使用、消息不能丢，需要换成它们的付费持久化存储（Railway支持挂载Volume，Render需要付费Disk），到时候再告诉我，我帮你改造存储层。

**具体步骤（以Railway为例，Render类似）：**

1. 把这个项目传到 GitHub（新建一个仓库，push代码上去）：
   ```bash
   cd sns-aggregator
   git init
   git add .
   git commit -m "init"
   # 去GitHub新建一个仓库，然后：
   git remote add origin 你的仓库地址
   git push -u origin main
   ```
2. 打开 [railway.app](https://railway.app)，用GitHub账号登录
3. 「New Project」-「Deploy from GitHub repo」，选择刚才push的仓库
4. 部署后，在项目的「Variables」标签页里，把 `.env.example` 里的配置项一项项加进去（先只加 `DINGTALK_APP_KEY` 和 `DINGTALK_APP_SECRET` 就够试验用了）
5. 「Settings」-「Networking」-「Generate Domain」，会生成一个类似 `https://xxx.up.railway.app` 的真实公网网址，这个就是你要的web link
6. 打开这个网址，能看到聚合界面；钉钉Stream模式不需要额外配置回调地址，服务启动后会自动连接

Render的流程基本一样：GitHub登录 -> New -> Blueprint -> 选仓库（会自动读取 `render.yaml`）-> 在环境变量里填密钥 -> 部署完成后平台会给一个 `https://xxx.onrender.com` 的网址。

### 方式B：自己的服务器/云主机部署

```bash
# 1. 安装依赖
npm install

# 2. 复制配置文件并填入真实密钥
cp .env.example .env
# 用编辑器打开 .env，把上一步拿到的CorpID/Secret/AppKey等都填进去

# 3. 启动服务
npm start
```

启动后访问 `http://服务器IP:3000` 就能看到聚合界面。

### 让企业微信/钉钉能访问到你的服务

它们的回调请求需要能访问到你的服务，两种方式：

- **有公网IP的服务器**：直接把域名解析过去，建议用nginx反代加HTTPS证书（企业微信/钉钉都要求HTTPS）
- **本地电脑/内网机器测试**：用 [ngrok](https://ngrok.com/) 或类似工具做内网穿透：
  ```bash
  ngrok http 3000
  # 会给你一个类似 https://xxxx.ngrok-free.app 的临时公网地址
  ```
  把这个地址填到 `.env` 的 `PUBLIC_BASE_URL`，并在企业微信/钉钉后台配置回调地址时使用它

## 四、目录结构

```
sns-aggregator/
├── backend/
│   ├── server.js          # 主服务、路由
│   ├── db.js               # SQLite数据存储
│   └── connectors/
│       ├── wecom.js        # 企业微信：token获取、回调验签解密
│       ├── dingtalk.js     # 钉钉：Stream模式长连接接收消息
│       └── email.js        # 邮箱：IMAP拉取
├── frontend/
│   └── index.html          # 聚合界面（原生JS，无需构建）
├── .env.example             # 配置模板
├── railway.json             # Railway一键部署配置
├── render.yaml               # Render一键部署配置
├── Procfile                  # 通用启动命令声明
├── .gitignore
└── package.json
```

## 五、后续可以扩展的方向

- 消息未读数统计、按发件人分组
- 企业微信/钉钉支持"回复消息"（目前只做了接收展示，回复需要额外调用发送消息接口）
- 关键词搜索、消息全文检索
- 多人共享 workspace（目前是单机单用户模式，数据存本地SQLite）

## 六、如果遇到问题

最常出的问题一般是：
1. **回调验证一直失败** → 多半是 Token/EncodingAESKey 配置错了，或者服务没跑起来就去验证
2. **钉钉接口报"接口已下线"** → 钉钉API迁移较频繁，需要对照当时最新文档调整请求地址
3. **邮箱连不上** → 检查是不是用了登录密码而非"客户端授权码"

遇到具体报错，把报错信息发给我，我可以帮你继续调试代码。
