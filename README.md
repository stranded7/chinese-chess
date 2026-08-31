# 中国象棋盲棋 · Three.js 3D

一个基于 Three.js 的 3D 中国象棋项目，重点支持 **盲棋** 玩法，同时保留普通中国象棋、人机盲棋和局域网联机盲棋。

在线玩法可通过本地服务器运行，适合在 Radmin / 局域网内和朋友对战。

## 盲棋规则

- 棋盘和中国象棋完全一致，将/帅固定在原位且明置。
- 除将/帅外的 30 枚棋子，全部随机放到所有非将帅初始格上。
- 红方棋子和黑方棋子可以互相出现在对方半场。
- 开局所有非将帅棋子均为暗子（背面朝上）。
- 暗子未翻开时，完全继承所在初始格原本棋子的属性：
  - 颜色；
  - 走法；
  - 吃法；
  - 过河规则；
  - 蹩马腿、塞象眼、炮翻山等限制。
- 暗子可以走子，也可以吃子。
- 暗子一旦移动，移动完成后立即翻开，恢复为真实身份。
- 被吃掉的暗子先翻开给双方看，再移除。
- 盲棋变体：士/仕、象/相都可以过河（不受九宫/河界限制）。
- 盲棋只以“将/帅被吃”结算胜负，不使用将死/困毙/长将判负。

## 模式

| 模式 | 说明 |
| --- | --- |
| 人机 · 简单 / 中等 / 困难 | 传统中国象棋 AI 对战 |
| 双人对弈 | 同一设备热座对战 |
| 盲棋 · 双人 | 本地双人盲棋 |
| 人机 · 盲棋 | 玩家执红、AI 执黑，AI 只看公开棋盘信息，不偷看暗子 |
| 联机 · 盲棋 | 通过局域网服务器进行双人盲棋对战 |

## 快速开始

### 普通本地玩法

```bash
python -m http.server 8080
```

浏览器打开：

```text
http://localhost:8080
```

### 局域网联机（Radmin LAN 可用）

需要启动内置的零依赖 Node.js 服务器：

```bash
node server.mjs
```

- 主机浏览器打开 `http://localhost:8080`；
- 主机选择「联机 · 盲棋」→「建立房间」；
- 朋友通过 Radmin 虚拟 IP 打开 `http://你的RadminIP:8080`；
- 朋友选择「联机 · 盲棋」→ 输入房间号 →「加入」。

> 注意：联机模式必须使用 `node server.mjs` 启动，不能用 `python -m http.server`，因为 WebSocket 联机通道只由 `server.mjs` 提供。

## AI 不偷看设计

人机盲棋中的 AI 使用**公开棋盘**：

- 只包含当前有效属性 `type / side / faceDown`；
- 不包含暗子的真实身份 `realType / realSide`；
- AI 在搜索内部也会主动清除真实身份字段。

因此 AI 不会“开天眼”，和人类玩家看到的信息一致。

## 测试

```bash
node test.mjs          # 标准中国象棋规则引擎测试
node blind-test.mjs    # 盲棋规则引擎测试
node blind-ai-test.mjs # 盲棋 AI 测试
node fuzz.mjs          # 3000 局随机对局模糊测试
node ai-test.mjs       # AI 引擎测试
```

## 文件结构

```text
index.html         页面布局与 UI
css/style.css      3D 棋盘样式
game.js            纯逻辑规则引擎（标准象棋 + 盲棋）
ai.js              AI 搜索（negamax + alpha-beta，支持盲棋公开信息模式）
server.mjs         局域网联机服务器（Node.js 内建模组，WebSocket + 静态文件）
main.js            Three.js 场景、交互、模式控制
blind-test.mjs     盲棋规则测试
blind-ai-test.mjs  盲棋 AI 测试
```

## 许可证

本项目基于 [MIT License](LICENSE)，保留原作者的版权声明。

## 其他语言

- [English](README.en.md)
- [繁體中文](README.zh-TW.md)
