// ============================================================
// 中國象棋 3D —— 區網聯機對戰伺服器（Node.js 內建模組，無需 npm 套件）
//
// 啟動：
//   node server.mjs
// 然後開瀏覽器：
//   http://localhost:8080
// 朋友用 Radmin LAN 虛擬 IP 訪問同一網址即可。
// ============================================================
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import {
  ROWS, COLS, RED, BLACK, name,
  blindInitialBoard, blindLegalMoves, blindApplyMove, blindInCheck,
  snapshotPiece, kingPos, notation,
} from './game.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8080);

// ---------------- 靜態檔案 ----------------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(__dirname, urlPath);
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not Found'); return; }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

// ---------------- 最小 WebSocket 實作 ----------------
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const clients = new Set();

function encodeFrame(str, opcode = 0x1) {
  const payload = Buffer.from(str, 'utf8');
  let header;
  if (payload.length < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x80 | opcode;
    header[1] = payload.length;
  } else if (payload.length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(payload.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(payload.length), 2);
  }
  return Buffer.concat([header, payload]);
}

function sendTo(client, obj) {
  if (!client || client.socket.destroyed) return;
  try { client.socket.write(encodeFrame(JSON.stringify(obj))); } catch {}
}

function broadcastRoom(room, obj) {
  for (const c of room.clients) sendTo(c, obj);
}

function decodeFrames(buf) {
  const frames = [];
  let offset = 0;
  let consumed = 0;
  while (offset < buf.length) {
    const frameStart = offset;
    if (offset + 2 > buf.length) { consumed = frameStart; break; }
    const b1 = buf[offset++];
    const fin = (b1 & 0x80) !== 0;
    const opcode = b1 & 0x0f;
    if (opcode === 0x8) { frames.push({ opcode: 8 }); offset = frameStart + 2; consumed = offset; break; }
    if (opcode === 0x9) { frames.push({ opcode: 9 }); offset = frameStart + 2; consumed = offset; break; }
    if (opcode === 0xA) { frames.push({ opcode: 10 }); offset = frameStart + 2; consumed = offset; break; }
    const b2 = buf[offset++];
    const masked = (b2 & 0x80) !== 0;
    let len = b2 & 0x7f;
    if (len === 126) {
      if (offset + 2 > buf.length) { consumed = frameStart; break; }
      len = buf.readUInt16BE(offset); offset += 2;
    } else if (len === 127) {
      if (offset + 8 > buf.length) { consumed = frameStart; break; }
      len = Number(buf.readBigUInt64BE(offset)); offset += 8;
    }
    let mask;
    if (masked) {
      if (offset + 4 > buf.length) { consumed = frameStart; break; }
      mask = buf.subarray(offset, offset + 4); offset += 4;
    }
    if (offset + len > buf.length) { consumed = frameStart; break; }
    const payload = Buffer.from(buf.subarray(offset, offset + len));
    offset += len;
    if (mask) {
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
    }
    if (fin && opcode === 1) frames.push({ opcode: 1, text: payload.toString('utf8') });
    consumed = offset;
  }
  return { frames, consumed };
}

// ---------------- 房間 ----------------
const rooms = new Map();

function randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += chars[(crypto.randomInt(0, chars.length))];
  return s;
}

function publicPiece(p) {
  if (!p) return null;
  return { id: p.id, type: p.type, side: p.side, faceDown: !!p.faceDown };
}

function publicCaptured(p) {
  if (!p) return null;
  return { type: p.type, side: p.side };
}

function publicBoard(board) {
  return board.map((row) => row.map((p) => publicPiece(p)));
}

function publicState(room) {
  return {
    type: 'state',
    code: room.code,
    board: publicBoard(room.board),
    turn: room.turn,
    capturedBy: {
      [RED]: room.capturedBy[RED].map(publicCaptured),
      [BLACK]: room.capturedBy[BLACK].map(publicCaptured),
    },
    logs: room.logs.slice(-200),
    over: room.over,
    winner: room.winner,
    endReason: room.endReason || null,
    waiting: room.clients.size < 2,
  };
}

function createRoom(seed) {
  const code = randomCode();
  const room = {
    code,
    seed: seed || '',
    board: blindInitialBoard(seed),
    turn: RED,
    capturedBy: { [RED]: [], [BLACK]: [] },
    logs: ['盲棋聯機對戰開始'],
    over: false,
    winner: null,
    endReason: null,
    clients: new Set(),
  };
  rooms.set(code, room);
  return room;
}

function handleDisconnect(client) {
  clients.delete(client);
  const room = client.room;
  if (!room) return;
  room.clients.delete(client);
  if (room.clients.size === 0) {
    rooms.delete(room.code);
  } else {
    broadcastRoom(room, { type: 'opponentLeft', message: '對方已離開房間' });
  }
}

function handleMessage(client, data) {
  let msg;
  try { msg = JSON.parse(data); } catch { return; }
  switch (msg.type) {
    case 'create': {
      if (client.room) { sendTo(client, { type: 'error', message: '你已在房間中' }); return; }
      const room = createRoom(msg.seed || '');
      const side = RED;
      client.room = room;
      client.side = side;
      room.clients.add(client);
      sendTo(client, { type: 'created', code: room.code, side });
      sendTo(client, { type: 'state', ...publicState(room), yourSide: side });
      break;
    }
    case 'join': {
      if (client.room) { sendTo(client, { type: 'error', message: '你已在房間中' }); return; }
      const room = rooms.get(String(msg.code || '').trim().toUpperCase());
      if (!room) { sendTo(client, { type: 'error', message: '找不到房間' }); return; }
      if (room.clients.size >= 2) { sendTo(client, { type: 'error', message: '房間已滿' }); return; }
      const side = BLACK;
      client.room = room;
      client.side = side;
      room.clients.add(client);
      for (const c of room.clients) sendTo(c, { type: 'opponentJoined', message: '對方已加入！' });
      for (const c of room.clients) {
        sendTo(c, { type: 'state', ...publicState(room), yourSide: c.side });
      }
      break;
    }
    case 'move': {
      const room = client.room;
      if (!room) { sendTo(client, { type: 'error', message: '尚未加入房間' }); return; }
      if (room.clients.size < 2) { sendTo(client, { type: 'error', message: '等待對方加入' }); return; }
      if (room.over) { sendTo(client, { type: 'error', message: '本局已結束' }); return; }
      if (client.side !== room.turn) { sendTo(client, { type: 'error', message: '還沒輪到你' }); return; }
      const { from, to } = msg;
      if (!from || !to) { sendTo(client, { type: 'error', message: '無效走法' }); return; }
      const legal = blindLegalMoves(room.board, from.r, from.c)
        .some((m) => m.r === to.r && m.c === to.c);
      if (!legal) { sendTo(client, { type: 'error', message: '非法走法' }); return; }

      const p = room.board[from.r][from.c];
      if (!p || p.side !== room.turn) { sendTo(client, { type: 'error', message: '不能移動該棋' }); return; }

      const fromSnapshot = snapshotPiece(p);
      const capturedSnapshot = snapshotPiece(room.board[to.r][to.c]);
      const nota = notation(room.board, from, to);
      const captured = blindApplyMove(room.board, from, to);
      let logNota = nota;
      if (fromSnapshot.faceDown) {
        const moved = room.board[to.r][to.c];
        logNota += `（翻開為${name(moved.side, moved.type)}）`;
      }
      if (captured && capturedSnapshot.faceDown) {
        logNota += `，吃子翻開為${name(captured.side, captured.type)}`;
      }
      room.logs.push(`${client.side === RED ? '紅方' : '黑方'} ${logNota}`);
      if (captured) room.capturedBy[client.side].push(captured);
      room.turn = client.side === RED ? BLACK : RED;

      const checked = blindInCheck(room.board, room.turn);
      if (checked) room.logs.push(`${room.turn === RED ? '紅方' : '黑方'}被將軍`);
      if (!kingPos(room.board, RED)) {
        room.over = true; room.winner = BLACK; room.endReason = '吃掉將帥';
      } else if (!kingPos(room.board, BLACK)) {
        room.over = true; room.winner = RED; room.endReason = '吃掉將帥';
      }
      for (const c of room.clients) {
        sendTo(c, { type: 'state', ...publicState(room), yourSide: c.side });
      }
      break;
    }
    case 'restart': {
      const room = client.room;
      if (!room) { sendTo(client, { type: 'error', message: '尚未加入房間' }); return; }
      room.board = blindInitialBoard(room.seed || '');
      room.turn = RED;
      room.capturedBy = { [RED]: [], [BLACK]: [] };
      room.logs = ['盲棋聯機對戰重新開始'];
      room.over = false;
      room.winner = null;
      room.endReason = null;
      for (const c of room.clients) {
        sendTo(c, { type: 'state', ...publicState(room), yourSide: c.side });
      }
      break;
    }
    case 'ping': {
      sendTo(client, { type: 'pong' });
      break;
    }
  }
}

// ---------------- HTTP / WebSocket ----------------
const server = http.createServer((req, res) => {
  if (req.headers.upgrade?.toLowerCase() === 'websocket') return;
  serveStatic(req, res);
});

server.on('upgrade', (req, socket) => {
  if (req.url !== '/ws') { socket.destroy(); return; }
  const key = req.headers['sec-websocket-key'];
  if (!key) { socket.destroy(); return; }
  const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
  );
  const client = { socket, room: null, side: null, buffer: Buffer.alloc(0) };
  clients.add(client);

  socket.on('data', (buf) => {
    client.buffer = Buffer.concat([client.buffer, buf]);
    const { frames, consumed } = decodeFrames(client.buffer);
    client.buffer = client.buffer.subarray(consumed);
    for (const f of frames) {
      if (f.opcode === 8) { socket.end(); return; }
      if (f.opcode === 9) {
        try { socket.write(encodeFrame('', 0xA)); } catch {}
        continue;
      }
      if (f.opcode === 1 && f.text) handleMessage(client, f.text);
    }
  });
  socket.on('close', () => handleDisconnect(client));
  socket.on('error', () => handleDisconnect(client));
});

server.listen(PORT, () => {
  console.log(`中國象棋聯機伺服器已啟動：http://localhost:${PORT}`);
  console.log(`用 Radmin LAN 位址讓朋友連入同一個 port：${PORT}`);
});
