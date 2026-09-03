// ============================================================
// 中国象棋 3D —— Three.js 呈现 + 互动
// ============================================================
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  ROWS, COLS, RED, BLACK,
  initialBoard, legalMoves, applyMove, inCheck,
  hasAnyLegalMove, name, notation, hashBoard, repetitionVerdict, kingPos,
  blindInitialBoard, blindLegalMoves, blindApplyMove, blindInCheck,
  snapshotPiece,
} from './game.js?v=ba4a7bcf38';

// ---------------- 常数 ----------------
const CELL = 1;
const PAD = 0.6;
const BOARD_W = (COLS - 1) * CELL + PAD * 2;
const BOARD_H = (ROWS - 1) * CELL + PAD * 2;
const PIECE_H = 0.36;
const Y0 = PIECE_H / 2; // 棋子中心高度（贴着盘面）

const to3D = (r, c) =>
  new THREE.Vector3((c - (COLS - 1) / 2) * CELL, 0, ((ROWS - 1) / 2 - r) * CELL);

// ---------------- 场景 / 相机 / 渲染 ----------------
const container = document.getElementById('stage');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x171310);
scene.fog = new THREE.Fog(0x171310, 20, 46);

const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);

// 预设机位：以注视点为圓心，向左旋转 90°（方位角 -90°）、向下翻转 45°（极角 45°）
const HOME_DIST = 14.8;
const HOME_AZIMUTH = -90;
const HOME_POLAR = 45;
const HOME_TGT = new THREE.Vector3(0, -0.1, 0.2);
const HOME = {
  tgt: HOME_TGT,
  pos: new THREE.Vector3()
    .setFromSphericalCoords(
      HOME_DIST,
      THREE.MathUtils.degToRad(HOME_POLAR),
      THREE.MathUtils.degToRad(HOME_AZIMUTH),
    )
    .add(HOME_TGT),
};
camera.position.copy(HOME.pos);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(HOME.tgt);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 5;
controls.maxDistance = 22;
controls.minPolarAngle = 0.25;
controls.maxPolarAngle = 1.38;
controls.enablePan = false;
controls.update();

// ---------------- 手机／窄屏幕：依解析度自动拉远镜头，让整盘都能看见 ----------------
let fitDist = HOME_DIST;
let cameraUserAdjusted = false;
controls.addEventListener('start', () => {
  // 使用者开始拖曳／缩放后，不再每次 resize 都强制拉远
  cameraUserAdjusted = true;
});

function fitDistanceForAspect(aspect) {
  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * Math.max(0.2, aspect));
  const halfW = BOARD_W / 2 + 0.45;
  const halfH = BOARD_H / 2 + 0.45;
  const needW = halfW / Math.tan(hFov / 2);
  const needH = halfH / Math.tan(vFov / 2);
  return Math.max(needW, needH) * 1.06;
}

function fitCameraToBoard() {
  const aspect = camera.aspect || 1;
  fitDist = fitDistanceForAspect(aspect);
  controls.maxDistance = Math.max(28, fitDist * 1.5);
  // 保留目前方位角/极角，只把半徑拉到可以看见完整棋盘
  const sph = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
  sph.radius = fitDist;
  camera.position.setFromSpherical(sph).add(controls.target);
  camera.lookAt(controls.target);
}

// ---------------- 灯光 ----------------
scene.add(new THREE.HemisphereLight(0xfff1dd, 0x241b12, 0.85));
const sun = new THREE.DirectionalLight(0xffe7c2, 1.9);
sun.position.set(6, 12, 7);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -9; sun.shadow.camera.right = 9;
sun.shadow.camera.top = 10; sun.shadow.camera.bottom = -10;
sun.shadow.camera.near = 2; sun.shadow.camera.far = 40;
sun.shadow.bias = -0.0006;
scene.add(sun);
const rim = new THREE.DirectionalLight(0x8fb7ff, 0.25);
rim.position.set(-8, 4, -6);
scene.add(rim);

// ---------------- 棋盘 ----------------
function makeBoardTexture() {
  const cell = 100, pad = 60;
  const W = (COLS - 1) * cell + pad * 2, H = (ROWS - 1) * cell + pad * 2;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');

  // 木纹底
  const grd = g.createLinearGradient(0, 0, W, H);
  grd.addColorStop(0, '#e0b884');
  grd.addColorStop(0.5, '#d5a971');
  grd.addColorStop(1, '#c99c64');
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 160; i++) {
    g.strokeStyle = `rgba(118,78,38,${0.03 + Math.random() * 0.05})`;
    g.lineWidth = 0.6 + Math.random() * 2.2;
    const y = Math.random() * H;
    g.beginPath();
    g.moveTo(0, y);
    g.bezierCurveTo(W * 0.3, y + (Math.random() * 16 - 8), W * 0.65, y + (Math.random() * 16 - 8), W, y + (Math.random() * 10 - 5));
    g.stroke();
  }

  const P = (r, c) => ({ x: pad + c * cell, y: pad + r * cell });
  const line = (a, b) => { g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); };

  // 外框
  g.strokeStyle = '#4a3320';
  g.lineWidth = 5;
  g.strokeRect(pad * 0.42, pad * 0.42, W - pad * 0.84, H - pad * 0.84);
  g.lineWidth = 3;
  g.strokeRect(pad, pad, W - pad * 2, H - pad * 2);

  // 横线
  for (let r = 0; r < ROWS; r++) line(P(r, 0), P(r, COLS - 1));
  // 縱线（中间被楚河汉界断开，两邊界线貫穿）
  for (let c = 0; c < COLS; c++) {
    if (c === 0 || c === COLS - 1) line(P(0, c), P(ROWS - 1, c));
    else { line(P(0, c), P(4, c)); line(P(5, c), P(9, c)); }
  }
  // 九宮斜线
  line(P(0, 3), P(2, 5)); line(P(0, 5), P(2, 3));
  line(P(7, 3), P(9, 5)); line(P(7, 5), P(9, 3));

  // 星位（炮位、兵位）
  g.lineWidth = 2.5;
  const star = (r, c) => {
    const p = P(r, c), d = 12, o = 8;
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      const x0 = p.x + sx * o, y0 = p.y + sy * o;
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + sx * d, y0); g.stroke();
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0, y0 + sy * d); g.stroke();
    }
  };
  for (const [r, c] of [
    [2, 1], [2, 7], [7, 1], [7, 7],
    [3, 0], [3, 2], [3, 4], [3, 6], [3, 8],
    [6, 0], [6, 2], [6, 4], [6, 6], [6, 8],
  ]) star(r, c);

  // 楚河 / 汉界 —— 直書：字沿河界縱向排列，且在预设视角下正立
  // （贴圖相对于画面旋转了 90°：画面上方 = 贴圖 +x，故字需旋转 90° 并沿 x 排列）
  g.fillStyle = 'rgba(74,51,32,0.8)';
  g.font = '56px "Kaiti SC","STKaiti","KaiTi","Noto Serif TC",serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const ry = (4 + 5) / 2 * cell + pad;
  const vChar = (ch, x) => {
    g.save();
    g.translate(x, ry);
    g.rotate(Math.PI / 2);
    g.fillText(ch, 0, 3);
    g.restore();
  };
  vChar('楚', 264); vChar('河', 196);          // 画面下方直書「楚河」
  vChar('汉', W - 196); vChar('界', W - 264);  // 画面上方直書「汉界」

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

const boardMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(BOARD_W, BOARD_H),
  new THREE.MeshStandardMaterial({ map: makeBoardTexture(), roughness: 0.72, metalness: 0.02 })
);
boardMesh.rotation.x = -Math.PI / 2;
boardMesh.receiveShadow = true;
scene.add(boardMesh);

// 盘底座
const slab = new THREE.Mesh(
  new THREE.BoxGeometry(BOARD_W + 0.55, 0.34, BOARD_H + 0.55),
  new THREE.MeshStandardMaterial({ color: 0x4a3626, roughness: 0.55, metalness: 0.12 })
);
slab.position.y = -0.18;
slab.castShadow = true;
slab.receiveShadow = true;
scene.add(slab);

// 地面
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(30, 48),
  new THREE.MeshStandardMaterial({ color: 0x141009, roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.45;
ground.receiveShadow = true;
scene.add(ground);

// ---------------- 棋子 ----------------
let sideMat = null, botMat = null;
function sharedPieceMats() {
  if (sideMat) return;
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 128;
  const g = cv.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 128);
  grd.addColorStop(0, '#cf9f66');
  grd.addColorStop(0.55, '#c2914f');
  grd.addColorStop(1, '#a97a42');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(90,58,26,0.25)';
  for (let i = 0; i < 7; i++) {
    g.lineWidth = 1 + Math.random() * 2;
    const y = Math.random() * 128;
    g.beginPath(); g.moveTo(0, y); g.lineTo(128, y + (Math.random() * 8 - 4)); g.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  sideMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0.05 });
  botMat = new THREE.MeshStandardMaterial({ color: 0x6b5133, roughness: 0.9 });
}
sharedPieceMats();

const PIECE_GEO = new THREE.CylinderGeometry(0.4, 0.46, PIECE_H, 48);

function makeTopTexture(side, type) {
  const s = 256;
  const cv = document.createElement('canvas');
  cv.width = s; cv.height = s;
  const g = cv.getContext('2d');
  const grd = g.createRadialGradient(s / 2, s / 2 - 22, 12, s / 2, s / 2, s / 2);
  grd.addColorStop(0, '#eed6a8');
  grd.addColorStop(0.72, '#dcb27a');
  grd.addColorStop(1, '#c08f52');
  g.fillStyle = grd;
  g.fillRect(0, 0, s, s);
  g.strokeStyle = 'rgba(118,78,38,0.16)';
  for (let i = 0; i < 6; i++) {
    g.lineWidth = 0.8 + Math.random() * 1.4;
    g.beginPath();
    g.arc(s / 2, s / 2, 26 + i * 13 + Math.random() * 5, 0, Math.PI * 2);
    g.stroke();
  }
  const col = side === RED ? 'rgba(173,42,32,0.96)' : 'rgba(36,33,29,0.96)';
  g.strokeStyle = col;
  g.lineWidth = 9;
  g.beginPath(); g.arc(s / 2, s / 2, s / 2 - 15, 0, Math.PI * 2); g.stroke();
  g.fillStyle = col;
  g.font = '900 118px "Kaiti SC","STKaiti","KaiTi","Noto Serif TC",serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  // 棋子文字朝向持有者：红方在原点侧（画面下方），黑方在远端（画面上方）
  if (side === BLACK) {
    g.translate(s / 2, s / 2);
    g.rotate(Math.PI);
    g.translate(-s / 2, -s / 2);
  }
  g.fillText(name(side, type), s / 2, s / 2 + 8);

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

function makeBackTexture() {
  const s = 256;
  const cv = document.createElement('canvas');
  cv.width = s; cv.height = s;
  const g = cv.getContext('2d');
  const grd = g.createRadialGradient(s / 2, s / 2 - 22, 12, s / 2, s / 2, s / 2);
  grd.addColorStop(0, '#e8d5b0');
  grd.addColorStop(0.72, '#d6b384');
  grd.addColorStop(1, '#c49a63');
  g.fillStyle = grd;
  g.fillRect(0, 0, s, s);
  g.strokeStyle = 'rgba(90,58,26,0.28)';
  g.lineWidth = 9;
  g.beginPath(); g.arc(s / 2, s / 2, s / 2 - 15, 0, Math.PI * 2); g.stroke();
  g.fillStyle = 'rgba(90,58,26,0.8)';
  g.font = '900 128px "Kaiti SC","STKaiti","KaiTi","Noto Serif TC",serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('？', s / 2, s / 2 + 6);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

function pieceTopMaterial(piece) {
  if (piece.faceDown) {
    return new THREE.MeshStandardMaterial({ map: makeBackTexture(), roughness: 0.5, metalness: 0.05 });
  }
  return new THREE.MeshStandardMaterial({ map: makeTopTexture(piece.side, piece.type), roughness: 0.5, metalness: 0.05 });
}

function makePiece(piece, r, c) {
  const m = new THREE.Mesh(
    PIECE_GEO,
    [sideMat, pieceTopMaterial(piece), botMat]
  );
  m.castShadow = true;
  m.receiveShadow = true;
  m.userData = { piece, r, c };
  const p = to3D(r, c);
  m.position.set(p.x, Y0, p.z);
  return m;
}

/** 棋子在暗子翻开／悔棋恢復暗子后，更新 3D 顶面贴圖 */
function updatePieceMesh(mesh) {
  if (!mesh) return;
  const piece = mesh.userData.piece;
  if (!piece) return;
  const old = mesh.material[1];
  mesh.material = [sideMat, pieceTopMaterial(piece), botMat];
  if (old && old.map) old.map.dispose();
  old?.dispose?.();
}

// ---------------- 高亮 ----------------
const selRing = new THREE.Mesh(
  new THREE.RingGeometry(0.5, 0.64, 48),
  new THREE.MeshBasicMaterial({ color: 0xf2c14e, transparent: true, opacity: 0.95, side: THREE.DoubleSide })
);
selRing.rotation.x = -Math.PI / 2;
selRing.visible = false;
scene.add(selRing);

// 最后一步标记（起点淡、终点深）
function mkLastMark(opacity) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(0.92, 0.92),
    new THREE.MeshBasicMaterial({ color: 0xf2c14e, transparent: true, opacity, depthWrite: false })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.012;
  m.renderOrder = 3;
  m.visible = false;
  scene.add(m);
  return m;
}
const lastFromMark = mkLastMark(0.13);
const lastToMark = mkLastMark(0.26);
function syncLastMoveMark() {
  const h = history[history.length - 1];
  lastFromMark.visible = lastToMark.visible = !!h;
  if (!h) return;
  const a = to3D(h.from.r, h.from.c);
  const b = to3D(h.to.r, h.to.c);
  lastFromMark.position.set(a.x, 0.012, a.z);
  lastToMark.position.set(b.x, 0.012, b.z);
}

const fx = new THREE.Group();
scene.add(fx);
function clearFX() {
  for (const c of [...fx.children]) {
    fx.remove(c);
    c.geometry.dispose();
    c.material.dispose();
  }
}
function addFX(mesh) {
  mesh.renderOrder = 5;
  mesh.position.y = 0.02;
  fx.add(mesh);
}
function showMoveDots(moves) {
  clearFX();
  for (const m of moves) {
    const p = to3D(m.r, m.c);
    if (board[m.r][m.c]) {
      // 可吃敌子：红圈包围
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.5, 0.64, 48),
        new THREE.MeshBasicMaterial({ color: 0xe2736a, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
      );
      ring.rotation.x = -Math.PI / 2;
      addFX(ring);
      ring.position.x = p.x; ring.position.z = p.z;
    } else {
      // 可走空位：綠点
      const dot = new THREE.Mesh(
        new THREE.CircleGeometry(0.28, 32),
        new THREE.MeshBasicMaterial({ color: 0x9fd68f, transparent: true, opacity: 0.85 })
      );
      dot.rotation.x = -Math.PI / 2;
      addFX(dot);
      dot.position.x = p.x; dot.position.z = p.z;
    }
  }
  showSelectRingAt(selected);
}

// ---------------- 声音 ----------------
let audio = null, muted = false;
function beep(freq, dur = 0.08, type = 'sine', gain = 0.12) {
  if (muted) return;
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.type = type;
    o.frequency.value = freq;
    o.connect(g);
    g.connect(audio.destination);
    const t = audio.currentTime;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t);
    o.stop(t + dur);
  } catch { /* 无音讯环境则忽略 */ }
}
const sfx = {
  select: () => beep(680, 0.05, 'triangle'),
  move: () => beep(420, 0.08, 'sine'),
  capture: () => { beep(210, 0.14, 'square', 0.1); setTimeout(() => beep(330, 0.1, 'sine'), 60); },
  check: () => { beep(660, 0.1); setTimeout(() => beep(880, 0.16), 90); },
  win: () => { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 0.16, 'triangle', 0.12), i * 110)); },
  lose: () => { [392, 311, 262].forEach((f, i) => setTimeout(() => beep(f, 0.2, 'sine', 0.09), i * 170)); },
};

// ---------------- tween ----------------
const tweens = [];
const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
function tween(dur, fn, done, delay = 0, tag = null) {
  tweens.push({ t0: performance.now() + delay, dur, fn, done, tag });
}
// 分页隐藏时 rAF 会暫停；用计时器低頻補跑主迴圈，避免棋局卡在动畫中
setInterval(() => { if (document.hidden) tick(performance.now()); }, 500);

function stepTweens(now) {
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i];
    if (now < tw.t0) continue;
    let k = (now - tw.t0) / tw.dur;
    if (k > 1) k = 1;
    tw.fn(ease(k));
    if (k === 1) {
      tweens.splice(i, 1);
      if (tw.done) tw.done();
    }
  }
}

// ---------------- 游戏状态 ----------------
let board = null;
let turn = RED;
let selected = null;   // {r,c}
let legal = [];        // 选中子的合法着法
let pieces = [];       // 所有棋子 mesh
let history = [];      // {from,to,captured,nota}
let posHistory = [];   // 每步之后的局面雜湊，供 AI 避免重复局面
let repHistory = [];   // {key,mover,check}：三次重复局面／长将判决用
let capturedBy = { [RED]: [], [BLACK]: [] };
let over = false, winner = null, busy = false;
let gameStartTime = Date.now();
let undoCount = 0;     // 本局悔棋次数（人机模式一次连退两着仍计 1 次）

// ---------------- 对弈模式 / AI ----------------
let mode = 'lan';   // 'pvp' | 'blind' | 'lan' | 'easy' | 'medium' | 'hard'
const AI_SIDE = BLACK; // 人机模式：玩家执红，AI 执黑
const isAI = () => mode !== 'pvp' && mode !== 'blind' && mode !== 'lan';
const isBlind = () => mode === 'blind' || mode === 'lan' || mode === 'blindai';
const isLAN = () => mode === 'lan' || mode === 'lanstd';
const isLANStd = () => mode === 'lanstd';
let lanSocket = null;
let lanRoomCode = null;
let lanSide = null;
let lanWaiting = false;
let lanConnected = false;
let lanPendingAction = null;
let lanOverTimer = null;
let aiThinking = false;
let aiToken = 0;       // 用于作廢过期的 AI 计算（开新局、悔棋后）
let aiMoveStart = 0;

let aiWorker = null;
let aiModule = null;   // Worker 不可用时的主执行緒后备
try {
  aiWorker = new Worker(new URL('./ai-worker.js?v=ba4a7bcf38', import.meta.url), { type: 'module' });
  aiWorker.onmessage = (e) => onAIResult(e.data);
  aiWorker.onerror = () => {
    aiWorker = null;
    if (aiThinking) requestAIMove();
  };
} catch {
  aiWorker = null;
}

function publicBlindBoard(src) {
  return src.map((row) => row.map((p) => (p ? {
    id: p.id,
    type: p.type,
    side: p.side,
    faceDown: !!p.faceDown,
  } : null)));
}

function requestAIMove() {
  const token = ++aiToken;
  const payload = {
    board: isBlind() ? publicBlindBoard(board) : board.map((row) => row.map((p) => (p ? { ...p } : null))),
    side: turn,
    level: mode,
    recent: posHistory.slice(-16),
    blind: isBlind(),
    token,
  };
  if (aiWorker) {
    aiWorker.postMessage(payload);
  } else {
    (aiModule ??= import('./ai.js?v=ba4a7bcf38')).then(({ findBestMove }) => {
      setTimeout(() => {
        if (token !== aiToken) return;
        onAIResult({ token, result: findBestMove(payload.board, payload.side, payload.level, payload.recent, payload.blind) });
      }, 30);
    });
  }
}

function maybeAIMove() {
  if (!isAI() || over || busy || turn !== AI_SIDE || aiThinking) return;
  aiThinking = true;
  aiMoveStart = performance.now();
  requestAIMove();
  refreshHUD();
}

function onAIResult({ token, result, error }) {
  if (token !== aiToken) return;
  if (error || !result) { aiThinking = false; refreshHUD(); return; }
  // 至少显示一小段「思考中」，节奏比較自然
  const wait = Math.max(0, 500 - (performance.now() - aiMoveStart));
  setTimeout(() => {
    if (token !== aiToken) return;
    aiThinking = false;
    if (over || busy || turn !== AI_SIDE) { refreshHUD(); return; }
    const { from, to } = result;
    const p = board[from.r] && board[from.r][from.c];
    const legal = isBlind() ? blindLegalMoves(board, from.r, from.c) : legalMoves(board, from.r, from.c);
    const ok = p && p.side === turn && legal.some((m) => m.r === to.r && m.c === to.c);
    if (!ok) { refreshHUD(); return; }
    doMove(from, to);
  }, wait);
}

// 除错／自动测试挂鉤
window.__chess = {
  get pieces() { return pieces; },
  get board() { return board; },
  get turn() { return turn; },
  get selected() { return selected; },
  get history() { return history; },
  get busy() { return busy; },
  get mode() { return mode; },
  get aiThinking() { return aiThinking; },
  setMode(m) { mode = m; const el = document.getElementById('modeSel'); if (el) el.value = m; },
  get lastResult() { return lastResult; },
  buildShareCard: (r) => buildShareCard(r || lastResult),
  resetTo,
  newGame,
  undo,
  doMove,
  camera, renderer, scene, controls,
};

const turnText = document.getElementById('turnText');
const turnDot = document.getElementById('turnDot');
const turnBox = document.getElementById('turn');
const logEl = document.getElementById('log');
const logEmpty = document.getElementById('logEmpty');
const capRedEl = document.getElementById('capRed');
const capBlackEl = document.getElementById('capBlack');
const banner = document.getElementById('checkBanner');
const overlay = document.getElementById('overlay');
const btnUndo = document.getElementById('btnUndo');
const lanPanel = document.getElementById('lanPanel');
const lanStatus = document.getElementById('lanStatus');
const lanJoinForm = document.getElementById('lanJoinForm');
const lanCodeInput = document.getElementById('lanCode');
const lanInfo = document.getElementById('lanInfo');
const lanRoomCodeEl = document.getElementById('lanRoomCode');
const lanSideEl = document.getElementById('lanSide');
const lanWaitingEl = document.getElementById('lanWaiting');
const btnLanCreate = document.getElementById('btnLanCreate');
const btnLanJoin = document.getElementById('btnLanJoin');
const btnLanLeave = document.getElementById('btnLanLeave');

function refreshHUD() {
  const showSide = over && winner ? winner : turn;
  const isRed = showSide === RED;
  if (over) {
    turnText.textContent = winner == null ? '和局' : winner === RED ? '红方胜' : '黑方胜';
  } else if (aiThinking) {
    turnText.textContent = 'AI 思考中…';
  } else if (isAI()) {
    turnText.textContent = isRed ? '轮到你了' : 'AI 行棋';
  } else {
    const prefix = isLANStd() ? '联机普通象棋・' : isLAN() ? '联机盲棋・' : isBlind() ? '盲棋・' : '';
    turnText.textContent = prefix + (isRed ? '红方行棋' : '黑方行棋');
  }
  const col = isRed ? '#c05345' : '#8b93a1';
  turnDot.style.background = col;
  turnDot.style.boxShadow = `0 0 10px ${col}`;
  turnBox.classList.toggle('thinking', aiThinking && !over);
  capRedEl.innerHTML = capturedBy[RED].map((p) => `<span class="chip ${p.side}">${name(p.side, p.type)}</span>`).join('') || '<em>—</em>';
  capBlackEl.innerHTML = capturedBy[BLACK].map((p) => `<span class="chip ${p.side}">${name(p.side, p.type)}</span>`).join('') || '<em>—</em>';
  btnUndo.disabled = history.length === 0 || busy || aiThinking || isLAN();
}

function addLog(nota, side) {
  logEmpty.style.display = 'none';
  const li = document.createElement('li');
  const dot = document.createElement('span');
  dot.className = 'side ' + side;
  dot.textContent = side === RED ? '红' : '黑';
  li.appendChild(dot);
  li.appendChild(document.createTextNode(' ' + nota));
  logEl.appendChild(li);
  while (logEl.children.length > 200) logEl.removeChild(logEl.firstChild);
  logEl.scrollTop = logEl.scrollHeight;
}

function clearSelection() {
  selected = null;
  legal = [];
  clearFX();
  selRing.visible = false;
}

function showSelectRingAt(pos) {
  if (!pos) { selRing.visible = false; return; }
  const p = to3D(pos.r, pos.c);
  selRing.position.set(p.x, 0.02, p.z);
  selRing.visible = true;
}

function select(r, c) {
  clearSelection();
  selected = { r, c };
  legal = isBlind() ? blindLegalMoves(board, r, c) : legalMoves(board, r, c);
  showSelectRingAt(selected);
  if (legal.length) showMoveDots(legal);
  sfx.select();
  refreshHUD();
}

function pieceAt(r, c) {
  return pieces.find((o) => o.userData.r === r && o.userData.c === c);
}

function buildScene() {
  clearSelection();
  for (const m of [...pieces]) scene.remove(m);
  pieces = [];
  let i = 0;
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const p = board[r][c];
      if (!p) continue;
      const m = makePiece(p, r, c);
      pieces.push(m);
      scene.add(m);
      m.position.y = 3.4;
      tween(420 + (i % 9) * 26, (k) => { m.position.y = 3.4 + (Y0 - 3.4) * k; }, null, (i >> 3) * 55);
      i++;
    }
}


/** 依目前 board 同步 3D 棋子，避免每次重播都整盘重建动畫 */
function syncSceneFromBoard() {
  const oldPieces = pieces.slice();
  const byId = new Map();
  for (const m of oldPieces) {
    const pid = m.userData.piece && m.userData.piece.id;
    if (pid) byId.set(pid, m);
  }
  const next = [];
  const usedIds = new Set();
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = board[r][c];
      if (!p) continue;
      const m = p.id ? byId.get(p.id) : null;
      if (m) {
        usedIds.add(p.id);
        const oldR = m.userData.r, oldC = m.userData.c;
        const oldPiece = m.userData.piece;
        m.userData.piece = p;
        m.userData.r = r;
        m.userData.c = c;
        if (!oldPiece || oldPiece.type !== p.type || oldPiece.side !== p.side || oldPiece.faceDown !== p.faceDown) {
          updatePieceMesh(m);
        }
        const target = to3D(r, c);
        if (oldR !== r || oldC !== c) {
          const from = m.position.clone();
          tween(220, (k) => {
            m.position.lerpVectors(from, target, k);
            m.position.y = Y0 + Math.sin(Math.PI * k) * 0.3;
          }, null);
        } else {
          m.position.set(target.x, Y0, target.z);
        }
        next.push(m);
      } else {
        const nm = makePiece(p, r, c);
        next.push(nm);
        scene.add(nm);
      }
    }
  }
  for (const m of oldPieces) {
    const pid = m.userData.piece && m.userData.piece.id;
    if (!pid || !usedIds.has(pid)) scene.remove(m);
  }
  pieces = next;
}

function getSeedInput() {
  const el = document.getElementById('seedInput');
  return el ? el.value.trim() : '';
}


// ---------------- 联机模式（LAN / WebSocket） ----------------
function updateLanPanel() {
  if (!lanPanel) return;
  const visible = isLAN();
  lanPanel.classList.toggle('hidden', !visible);
  if (!visible) { lanPanel.classList.remove('playing'); return; }
  if (!lanConnected) {
    lanStatus.textContent = '尚未连线，请建立或加入房间';
    lanJoinForm.classList.remove('hidden');
    lanInfo.classList.add('hidden');
    btnLanLeave.classList.add('hidden');
  } else if (!lanRoomCode) {
    lanStatus.textContent = '已连线，请建立或加入房间';
    lanJoinForm.classList.remove('hidden');
    lanInfo.classList.add('hidden');
    btnLanLeave.classList.add('hidden');
  } else {
    const titleEl = document.getElementById('lanPanelTitle');
    if (titleEl) titleEl.textContent = isLANStd() ? '联机普通象棋' : '联机盲棋';
    lanStatus.textContent = lanWaiting ? '已建立房间，等待对方加入…' : '对战进行中';
    lanJoinForm.classList.add('hidden');
    lanInfo.classList.remove('hidden');
    btnLanLeave.classList.remove('hidden');
    lanRoomCodeEl.textContent = lanRoomCode;
    lanSideEl.textContent = lanSide === RED ? '红方（先手）' : '黑方（后手）';
    lanWaitingEl.classList.toggle('hidden', !lanWaiting);
  }
  if (lanPanel) lanPanel.classList.toggle('playing', !!lanRoomCode && !lanWaiting);
}

function lanConnect() {
  if (lanSocket && (lanSocket.readyState === 0 || lanSocket.readyState === 1)) return;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const url = `${proto}://${location.host}/ws`;
  try {
    lanSocket = new WebSocket(url);
  } catch {
    lanStatus.textContent = 'WebSocket 连线失敗';
    return;
  }
  lanSocket.addEventListener('open', () => {
    lanConnected = true;
    updateLanPanel();
    if (lanPendingAction) {
      const action = lanPendingAction;
      lanPendingAction = null;
      lanSend(action);
    }
  });
  lanSocket.addEventListener('message', (e) => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }
    handleLanMessage(msg);
  });
  lanSocket.addEventListener('close', () => {
    lanConnected = false;
    lanSocket = null;
    lanStatus.textContent = '连线已中断';
    updateLanPanel();
  });
  lanSocket.addEventListener('error', () => {
    lanConnected = false;
    lanStatus.textContent = '连线错误，请用 node server.mjs 启动联机服务器';
    toast('连线失敗，请改用 node server.mjs 启动');
    updateLanPanel();
  });
  updateLanPanel();
}

function lanSend(obj) {
  if (!lanSocket || lanSocket.readyState !== 1) {
    toast('尚未连线到联机服务器');
    return;
  }
  lanSocket.send(JSON.stringify(obj));
}

function lanCreateRoom() {
  const mode = isLANStd() ? 'std' : 'blind';
  if (!lanSocket || lanSocket.readyState !== 1) {
    lanStatus.textContent = '正在连线到联机服务器…';
    lanPendingAction = { type: 'create', seed: getSeedInput(), mode };
    lanConnect();
    return;
  }
  lanSend({ type: 'create', seed: getSeedInput(), mode });
}

function lanJoinRoom() {
  const code = (lanCodeInput.value || '').trim().toUpperCase();
  if (!code) { toast('请输入房间号'); return; }
  if (!lanSocket || lanSocket.readyState !== 1) {
    lanStatus.textContent = '正在连线到联机服务器…';
    lanPendingAction = { type: 'join', code };
    lanConnect();
    return;
  }
  lanSend({ type: 'join', code });
}

function lanLeaveRoom() {
  lanRoomCode = null;
  lanSide = null;
  lanWaiting = false;
  lanPendingAction = null;
  if (lanSocket && lanSocket.readyState <= 1) lanSocket.close();
  lanSocket = null;
  lanConnected = false;
  updateLanPanel();
}

function lanRestart() {
  lanSend({ type: 'restart' });
}

function renderLanLogs(logs) {
  logEl.innerHTML = '';
  logEmpty.style.display = logs && logs.length ? 'none' : '';
  if (!logs) return;
  for (const line of logs) {
    const li = document.createElement('li');
    const dot = document.createElement('span');
    dot.className = 'side ' + (line.startsWith('红方') ? RED : line.startsWith('黑方') ? BLACK : '');
    dot.textContent = line.startsWith('红方') ? '红' : line.startsWith('黑方') ? '黑' : '·';
    li.appendChild(dot);
    li.appendChild(document.createTextNode(' ' + line));
    logEl.appendChild(li);
  }
  logEl.scrollTop = logEl.scrollHeight;
}

function applyLanState(msg) {
  board = msg.board.map((row) => row.map((p) => (p ? { ...p } : null)));
  turn = msg.turn;
  capturedBy = {
    [RED]: (msg.capturedBy && msg.capturedBy[RED]) || [],
    [BLACK]: (msg.capturedBy && msg.capturedBy[BLACK]) || [],
  };
  over = !!msg.over;
  winner = msg.winner || null;
  lanWaiting = !!msg.waiting;
  lanRoomCode = msg.code || lanRoomCode;
  lanSide = msg.yourSide || lanSide;
  busy = false;
  clearSelection();
  posHistory = [hashBoard(board)];
  repHistory = [];
  history = [];
  syncLastMoveMark();
  syncSceneFromBoard();
  renderLanLogs(msg.logs || []);
  refreshHUD();
  if (!over) {
    // 新对局／重开时关闭结算层
    if (lanOverTimer) { clearTimeout(lanOverTimer); lanOverTimer = null; }
    stopConfetti();
    overlay.classList.add('hidden');
    banner.classList.add('hidden');
  } else {
    if (lanOverTimer) clearTimeout(lanOverTimer);
    lanOverTimer = setTimeout(() => {
      lanOverTimer = null;
      showGameOver(msg.endReason || '吃掉将帅');
    }, 300);
  }
  updateLanPanel();
}

function handleLanMessage(msg) {
  if (msg.type === 'created') {
    lanRoomCode = msg.code;
    lanSide = msg.side;
    lanWaiting = true;
    toast(`房间已建立：${msg.code}`);
    updateLanPanel();
  } else if (msg.type === 'state') {
    applyLanState(msg);
  } else if (msg.type === 'opponentJoined') {
    lanWaiting = false;
    toast('对方已加入！');
    updateLanPanel();
  } else if (msg.type === 'opponentLeft') {
    lanWaiting = false;
    toast('对方已离开房间');
    updateLanPanel();
  } else if (msg.type === 'error') {
    toast(msg.message || '错误');
    busy = false;
    updateLanPanel();
  } else if (msg.type === 'pong') {
    // 忽略
  }
}

function lanSendMove(from, to) {
  if (!lanSocket || lanSocket.readyState !== 1) {
    toast('尚未连接到服务器，请稍后重试');
    return;
  }
  busy = true;
  refreshHUD();
  lanSend({ type: 'move', from, to });
}

function newGame() {
  if (isLAN()) {
    updateLanPanel();
    if (!lanConnected) {
      lanConnect();
    }
    if (!lanRoomCode) {
      board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
      buildScene();
    } else if (lanConnected) {
      lanRestart();
    }
    return;
  }
  tweens.length = 0;
  aiToken++;
  aiThinking = false;
  history = [];
  capturedBy = { [RED]: [], [BLACK]: [] };
  over = false;
  winner = null;
  busy = false;
  board = isBlind() ? blindInitialBoard(getSeedInput()) : initialBoard();
  turn = RED;
  posHistory = [hashBoard(board)];
  repHistory = [{ key: hashBoard(board) + '|' + turn, mover: null, check: false }];
  gameStartTime = Date.now();
  undoCount = 0;
  stopConfetti();
  overlay.classList.add('hidden');
  banner.classList.add('hidden');
  logEl.innerHTML = '';
  logEmpty.style.display = '';
  syncLastMoveMark();
  buildScene();
  refreshHUD();
}

/** 测试用：直接布局 */
function resetTo(customBoard, turnSide) {
  tweens.length = 0;
  aiToken++;
  aiThinking = false;
  board = customBoard;
  if (turnSide) turn = turnSide;
  posHistory = [hashBoard(board)];
  repHistory = [{ key: hashBoard(board) + '|' + turn, mover: null, check: false }];
  history = [];
  capturedBy = { [RED]: [], [BLACK]: [] };
  over = false;
  winner = null;
  busy = false;
  gameStartTime = Date.now();
  undoCount = 0;
  stopConfetti();
  overlay.classList.add('hidden');
  banner.classList.add('hidden');
  logEl.innerHTML = '';
  logEmpty.style.display = '';
  syncLastMoveMark();
  buildScene();
  refreshHUD();
}

function animateCapture(m, done) {
  const y0 = m.position.y;
  const s0 = m.scale.x;
  tween(280, (k) => {
    const s = Math.max(0.06, s0 * (1 - 0.92 * k));
    m.scale.set(s, s, s);
    m.position.y = y0 * (1 - k) + 0.02;
    m.rotation.y = k * 1.1;
  }, done);
}

function doMove(from, to) {
  const p = pieceAt(from.r, from.c);
  const cap = pieceAt(to.r, to.c);
  const captured = board[to.r][to.c];
  const movingPiece = board[from.r][from.c];
  const blind = isBlind();
  const nota = notation(board, from, to);
  const fromSnapshot = blind ? snapshotPiece(movingPiece) : null;
  const capturedSnapshot = blind ? snapshotPiece(captured) : null;

  if (blind) {
    // 被吃暗子会在 blindApplyMove 内先翻开；翻开后立刻更新 mesh，
    // 这样缩小移除前双方能看到真实身份。
    blindApplyMove(board, from, to);
    if (captured && capturedSnapshot?.faceDown) updatePieceMesh(cap);
  } else {
    applyMove(board, from, to);
  }

  p.userData.r = to.r;
  p.userData.c = to.c;
  history.push({ from, to, captured, nota, blind: blind ? { fromSnapshot, capturedSnapshot } : null });
  posHistory.push(hashBoard(board));
  syncLastMoveMark();
  clearSelection();
  busy = true;
  refreshHUD();

  sfx.move();
  const from3 = p.position.clone();
  const to3 = to3D(to.r, to.c);
  tween(340, (k) => {
    p.position.lerpVectors(from3, to3, k);
    p.position.y = Y0 + Math.sin(Math.PI * k) * 0.55;
  }, () => {
    // 移动的暗子在走到目的地后立即翻开，更新 3D 贴圖
    if (blind && fromSnapshot && fromSnapshot.faceDown) updatePieceMesh(p);
    if (cap) {
      sfx.capture();
      animateCapture(cap, () => {
        scene.remove(cap);
        const i = pieces.indexOf(cap);
        if (i >= 0) pieces.splice(i, 1);
        finishMove(nota, captured);
      });
    } else {
      finishMove(nota, captured);
    }
  });
}

function finishMove(nota, captured) {
  const mover = turn;
  const blind = isBlind();

  if (captured) capturedBy[turn].push(captured);

  let logNota = nota;
  if (blind) {
    const entry = history[history.length - 1];
    if (entry?.blind?.fromSnapshot?.faceDown) {
      const moved = board[entry.to.r][entry.to.c];
      if (moved) logNota += `（翻开为${name(moved.side, moved.type)}）`;
    }
    if (captured && entry?.blind?.capturedSnapshot?.faceDown) {
      logNota += `，吃子翻开为${name(captured.side, captured.type)}`;
    }
  }
  addLog(logNota, turn);

  turn = turn === RED ? BLACK : RED;
  busy = false;

  const checked = blind ? blindInCheck(board, turn) : inCheck(board, turn);
  repHistory.push({ key: hashBoard(board) + '|' + turn, mover, check: checked });

  let endReason = null; // '吃掉将帅' | '将死' | '困毙' | '长将' | '三次重复局面' | '双方长将'

  if (blind) {
    // 盲棋第一版：只以「将/帅被吃」为终局条件，不使用将死/困毙/长将判决。
    if (!kingPos(board, RED)) {
      over = true;
      winner = BLACK;
      endReason = '吃掉将帅';
    } else if (!kingPos(board, BLACK)) {
      over = true;
      winner = RED;
      endReason = '吃掉将帅';
    }
    if (checked) {
      sfx.check();
      showBanner();
    }
    if (over) refreshHUD();
    setTimeout(() => { if (over) showGameOver(endReason); }, endReason ? 300 : 0);
    refreshHUD();
    maybeAIMove();
    return;
  }

  const has = hasAnyLegalMove(board, turn);
  if (!has) {
    over = true;
    winner = turn === RED ? BLACK : RED;
    endReason = checked ? '将死' : '困毙';
  } else {
    // 长将判负／三次重复局面判和
    const verdict = repetitionVerdict(repHistory, repHistory[repHistory.length - 1].key);
    if (verdict) {
      over = true;
      if (verdict.result === 'loss') {
        winner = verdict.loser === RED ? BLACK : RED;
        endReason = '长将';
      } else {
        winner = null;
        endReason = verdict.reason;
      }
    }
  }
  if (checked) {
    sfx.check();
    showBanner();
  }
  if (over) {
    refreshHUD();
    setTimeout(() => showGameOver(endReason), endReason === '将死' ? 900 : 300);
  }
  refreshHUD();
  maybeAIMove();
}

function showBanner() {
  banner.classList.remove('hidden');
  clearTimeout(showBanner._t);
  showBanner._t = setTimeout(() => banner.classList.add('hidden'), 1500);
}

function undoPly() {
  const h = history.pop();
  posHistory.pop();
  repHistory.pop();
  const p = pieceAt(h.to.r, h.to.c);

  // 盲棋：先还原移动棋子的暗子／真实身份，再移动回去
  if (h.blind && h.blind.fromSnapshot) {
    Object.assign(p.userData.piece, h.blind.fromSnapshot);
  }

  applyMove(board, h.to, h.from);
  p.userData.r = h.from.r;
  p.userData.c = h.from.c;
  const pos = to3D(h.from.r, h.from.c);
  p.position.set(pos.x, Y0, pos.z);
  updatePieceMesh(p);

  if (h.captured) {
    const restored = h.blind?.capturedSnapshot
      ? { ...h.blind.capturedSnapshot }
      : h.captured;
    board[h.to.r][h.to.c] = restored; // 被吃的子也要放回邏輯棋盘，不能只復原 mesh
    const cm = makePiece(restored, h.to.r, h.to.c);
    pieces.push(cm);
    scene.add(cm);
    capturedBy[turn === RED ? BLACK : RED].pop();
  }
  turn = turn === RED ? BLACK : RED;
}

function undo() {
  if (isLAN() || !history.length || busy || aiThinking) return;
  undoCount++;
  aiToken++; // 作廢进行中的 AI 计算
  undoPly();
  // 人机模式：连 AI 那一步一起退，回到玩家回合
  if (isAI() && turn === AI_SIDE && history.length) undoPly();
  addLog('悔棋', turn);
  if (over) { over = false; winner = null; }
  stopConfetti();
  overlay.classList.add('hidden');
  clearSelection();
  syncLastMoveMark();
  refreshHUD();
}

// ---------------- 输入 ----------------
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function pick(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  ndc.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  // 1) 先找棋子
  const hits = ray.intersectObjects(pieces, false);
  const obj = hits.length ? hits[0].object : null;
  if (obj && obj.userData.piece) return obj;
  // 2) 再找盘面，吸附到最近的交叉点
  const bh = ray.intersectObject(boardMesh, false);
  if (bh.length) {
    const p = bh[0].point;
    let best = null, bestD = 0.5 * 0.5;
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        const q = to3D(r, c);
        const dx = p.x - q.x, dz = p.z - q.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestD) { bestD = d2; best = { r, c }; }
      }
    if (best) return best;
  }
  return null;
}

renderer.domElement.addEventListener('pointermove', (e) => {
  const hit = pick(e);
  renderer.domElement.style.cursor = hit ? 'pointer' : (viewLocked ? 'default' : 'grab');
});

let downXY = null;
renderer.domElement.addEventListener('pointerdown', (e) => { downXY = [e.clientX, e.clientY]; });
// 拖曳／滚轮结束后记住视角（个人化，存浏览器）
renderer.domElement.addEventListener('pointerup', queueSaveViewPrefs);
renderer.domElement.addEventListener('wheel', queueSaveViewPrefs, { passive: true });

renderer.domElement.addEventListener('click', (e) => {
  if (downXY && Math.hypot(e.clientX - downXY[0], e.clientY - downXY[1]) > 8) {
    downXY = null; // 拖曳旋转视角后產生的 click，忽略
    return;
  }
  downXY = null;
  if (busy || over || aiThinking || (isAI() && turn === AI_SIDE)) return;
  const hit = pick(e);
  if (!hit) { clearSelection(); refreshHUD(); return; }

  // 点到棋子
  if (hit.userData && hit.userData.piece) {
    const { r, c, piece } = hit.userData;
    if (piece.side !== turn) {
      // 敌子：若为合法目标则执行
      if (selected && legal.some((m) => m.r === r && m.c === c)) {
        if (isLAN()) lanSendMove(selected, { r, c });
        else doMove(selected, { r, c });
      }
      return;
    }
    if (selected && selected.r === r && selected.c === c) { clearSelection(); refreshHUD(); return; }
    select(r, c);
    return;
  }

  // 点到空交叉点：合法则走，否则取消选中
  const { r, c } = hit;
  if (selected && legal.some((m) => m.r === r && m.c === c)) {
    if (isLAN()) lanSendMove(selected, { r, c });
    else doMove(selected, { r, c });
  } else {
    clearSelection();
  }
  refreshHUD();
});

// ---------------- 终局画面 / 彩帶 / 分享 ----------------
const SITE_URL = 'https://chinese-chess.gh.miniasp.com/';
const DIFF = {
  easy:   { label: '简单', stars: 1, winTitle: '旗开得胜！', winSub: '小试身手就拿下 AI，好的开始！' },
  medium: { label: '中等', stars: 2, winTitle: '运籌帷幄！', winSub: '攻守有度，中等 AI 也不是你的对手！' },
  hard:   { label: '困难', stars: 3, winTitle: '棋壇霸主！', winSub: '深算远謀，最强 AI 也俯首称臣！' },
  blindai:{ label: '盲棋', stars: 2, winTitle: '盲棋突围！', winSub: '在暗棋迷雾中胜出，好眼力！' },
};

const ovCard = document.getElementById('ovCard');
const ovBadge = document.getElementById('ovBadge');
const ovTitle = document.getElementById('ovTitle');
const ovStars = document.getElementById('ovStars');
const ovSub = document.getElementById('ovSub');
const ovReason = document.getElementById('ovReason');
const stRounds = document.getElementById('stRounds');
const stTime = document.getElementById('stTime');
const stCaps = document.getElementById('stCaps');
const stUndo = document.getElementById('stUndo');
const btnShare = document.getElementById('btnShare');
const toastEl = document.getElementById('toast');
let lastResult = null;

const fmtTime = (secs) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

let toastTimer = 0;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.add('hidden'), 3600);
}

function showGameOver(endReason) {
  const pvp = !isAI();
  const pvpLabel = isLANStd() ? '联机・普通象棋' : isLAN() ? '联机・盲棋' : isBlind() ? '盲棋・双人' : '双人对弈';
  const draw = winner == null;
  const playerWin = !pvp && !draw && winner !== AI_SIDE;
  const d = pvp ? null : DIFF[mode];
  const plies = Math.max(1, history.length); // 棋谱着法数
  const secs = Math.max(1, Math.round((Date.now() - gameStartTime) / 1000));
  const caps = pvp ? capturedBy[winner ?? RED].length : capturedBy[RED].length;
  const pure = undoCount === 0; // 全程零悔棋：純度勳章
  const reasonChars = draw ? '和棋' : endReason; // 战绩卡红印：将死/困毙/长将/和棋
  const winLabel = winner === RED ? '红方' : '黑方';
  const celebrate = !draw && (pvp || playerWin);

  let title, sub, badge, cardTitle, cardSub, shareText;
  if (draw) {
    title = '和局';
    sub = pvp ? '棋逢敌手，握手言和！' : '势均力敌，不分胜负！';
    badge = pvp ? pvpLabel : `人机对弈 ・ ${d.label}`;
    cardTitle = '和局';
    cardSub = `${pvp ? pvpLabel : `「${d.label}」AI`} ・ 鏖战 ${plies} 着${pure ? ' ・ 零悔棋' : ''}`;
    shareText = `我們在 3D 中国象棋鏖战 ${plies} 着，弈和不分胜负！來对弈一局：${SITE_URL}`;
  } else if (pvp) {
    title = `${winLabel}胜`;
    sub = '棋逢敌手，精彩对弈！';
    badge = pvpLabel;
    cardTitle = `${winLabel}胜出`;
    cardSub = `${pvpLabel} ・ 鏖战 ${plies} 着${pure ? ' ・ 零悔棋' : ''}`;
    shareText = `我們在 3D 中国象棋鏖战 ${plies} 着，${winLabel}獲胜！來对弈一局：${SITE_URL}`;
  } else if (playerWin) {
    title = d.winTitle;
    sub = d.winSub;
    badge = `人机对弈 ・ ${d.label}`;
    cardTitle = d.winTitle.replace('！', '');
    cardSub = `战胜「${d.label}」AI ・ ${plies} 着${pure ? ' ・ 零悔棋' : ''}`;
    shareText = pure
      ? `我在 3D 中国象棋全程零悔棋、${plies} 着战胜「${d.label}」AI 🏆 不服來战：${SITE_URL}`
      : `我在 3D 中国象棋以 ${plies} 着战胜「${d.label}」AI 🏆 不服來战：${SITE_URL}`;
  } else {
    title = '惜敗…';
    sub = '胜敗乃兵家常事，捲土重來！';
    badge = `人机对弈 ・ ${d.label}`;
  }

  lastResult = { pvp, playerWin, draw, d, plies, secs, caps, undoCount, pure, reasonChars, cardTitle, cardSub, shareText };

  ovBadge.textContent = badge;
  ovTitle.textContent = title;
  ovSub.textContent = sub;
  if (d && !draw) {
    ovStars.innerHTML = [1, 2, 3].map((i) =>
      `<span class="${i <= d.stars ? 'on' : ''}" style="animation-delay:${0.2 + i * 0.14}s">★</span>`
    ).join('');
    ovStars.style.display = '';
  } else {
    ovStars.style.display = 'none';
  }
  stRounds.textContent = plies;
  stTime.textContent = fmtTime(secs);
  stCaps.textContent = caps;
  stUndo.textContent = undoCount;
  stUndo.classList.toggle('pure', pure);
  ovReason.textContent = draw
    ? `${endReason}，判和`
    : endReason === '长将'
      ? (celebrate ? '对方「长将」判负' : '「长将」判负')
      : (celebrate ? `以「${reasonChars}」取胜` : `遭「${reasonChars}」落敗`);
  ovCard.classList.toggle('win', celebrate);
  ovCard.classList.toggle('lose', !celebrate && !draw);
  btnShare.style.display = celebrate ? '' : 'none';
  overlay.classList.remove('hidden');
  if (celebrate) {
    sfx.win();
    startConfetti();
  } else {
    stopConfetti();
    if (!draw) sfx.lose();
  }
}

// ----- 彩帶 -----
const confettiCv = document.getElementById('confettiCv');
const CONF_COLORS = ['#f2c14e', '#e2736a', '#e9decb', '#d9a441', '#c05345', '#9fd68f'];
let confettiRAF = 0;

// rAF 在分页进背景时会暫停，不能靠迴圈自己收尾；关闭 overlay 时須主动停止并清空
function stopConfetti() {
  cancelAnimationFrame(confettiRAF);
  confettiCv.getContext('2d').clearRect(0, 0, confettiCv.width, confettiCv.height);
}

function startConfetti() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = confettiCv.width = confettiCv.clientWidth * dpr;
  const h = confettiCv.height = confettiCv.clientHeight * dpr;
  const g = confettiCv.getContext('2d');
  const spawn = (initial) => ({
    x: Math.random() * w,
    y: initial ? Math.random() * h * 2 - h : -20 * dpr, // 开场一半洒在画面内、一半自上方落下
    w: (5 + Math.random() * 6) * dpr,
    h: (8 + Math.random() * 9) * dpr,
    vx: (-0.6 + Math.random() * 1.2) * dpr,
    vy: (1.4 + Math.random() * 2.4) * dpr,
    rot: Math.random() * Math.PI,
    vr: -0.12 + Math.random() * 0.24,
    sway: Math.random() * Math.PI * 2,
    color: CONF_COLORS[(Math.random() * CONF_COLORS.length) | 0],
  });
  const parts = Array.from({ length: 130 }, () => spawn(true));
  cancelAnimationFrame(confettiRAF);
  const step = () => {
    if (overlay.classList.contains('hidden')) { g.clearRect(0, 0, w, h); return; }
    g.clearRect(0, 0, w, h);
    for (const p of parts) {
      p.sway += 0.05;
      p.x += p.vx + Math.sin(p.sway) * 0.9 * dpr;
      p.y += p.vy;
      p.rot += p.vr;
      if (p.y > h + 24 * dpr) Object.assign(p, spawn(false));
      g.save();
      g.translate(p.x, p.y);
      g.rotate(p.rot);
      g.fillStyle = p.color;
      g.globalAlpha = 0.6 + Math.abs(Math.sin(p.sway)) * 0.4; // 翻面时明暗變化
      g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      g.restore();
    }
    confettiRAF = requestAnimationFrame(step);
  };
  confettiRAF = requestAnimationFrame(step);
}

// ----- 战绩卡（分享圖）-----
function roundRectPath(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

async function buildShareCard(res) {
  const W = 1080, H = 1350;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const serif = '"Kaiti SC","STKaiti","KaiTi","Noto Serif TC",serif';
  const sans = '"PingFang TC","Microsoft JhengHei","Noto Sans TC",sans-serif';

  // 底色 + 双线描金外框
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#261c12');
  bg.addColorStop(1, '#120e09');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(217,164,65,0.4)';
  g.lineWidth = 3;
  g.strokeRect(30, 30, W - 60, H - 60);
  g.strokeStyle = 'rgba(217,164,65,0.16)';
  g.lineWidth = 1;
  g.strokeRect(44, 44, W - 88, H - 88);

  g.textAlign = 'center';
  g.fillStyle = '#9a8a74';
  g.font = `600 30px ${sans}`;
  g.fillText('中 國 象 棋 ・ 3 D 对 弈', W / 2, 118);

  g.fillStyle = '#f2c14e';
  g.shadowColor = 'rgba(242,193,78,0.45)';
  g.shadowBlur = 28;
  g.font = `900 96px ${serif}`;
  g.fillText(res.cardTitle, W / 2, 236);
  g.shadowBlur = 0;

  const starStr = res.d ? '★'.repeat(res.d.stars) + '☆'.repeat(3 - res.d.stars) + '　' : '';
  g.fillStyle = '#d9a441';
  g.font = `700 40px ${sans}`;
  g.fillText(`${starStr}${res.cardSub}`, W / 2, 306);

  // 终局棋盘：WebGL 缓冲在 present 后即失效，須重繪后立即 drawImage
  const bx = 90, by = 344, bw = 900, bh = 656;
  g.save();
  roundRectPath(g, bx, by, bw, bh, 22);
  g.clip();
  renderer.render(scene, camera);
  const shot = renderer.domElement;
  const sc = Math.max(bw / shot.width, bh / shot.height);
  const sw = bw / sc, sh = bh / sc;
  g.drawImage(shot, (shot.width - sw) / 2, (shot.height - sh) / 2, sw, sh, bx, by, bw, bh);
  g.restore();
  roundRectPath(g, bx, by, bw, bh, 22);
  g.strokeStyle = 'rgba(217,164,65,0.5)';
  g.lineWidth = 3;
  g.stroke();

  // 红印：将死 / 困毙
  g.save();
  g.translate(bx + bw - 92, by + bh - 92);
  g.rotate(-0.1);
  const ss = 150;
  g.fillStyle = 'rgba(179,44,32,0.94)';
  roundRectPath(g, -ss / 2, -ss / 2, ss, ss, 14);
  g.fill();
  g.strokeStyle = 'rgba(245,233,214,0.85)';
  g.lineWidth = 4;
  roundRectPath(g, -ss / 2 + 9, -ss / 2 + 9, ss - 18, ss - 18, 8);
  g.stroke();
  g.fillStyle = '#f5e9d6';
  g.font = `900 56px ${serif}`;
  g.textBaseline = 'middle';
  g.fillText(res.reasonChars[0], 0, -33);
  g.fillText(res.reasonChars[1], 0, 35);
  g.restore();
  g.textBaseline = 'alphabetic';

  // 战绩统计
  g.strokeStyle = 'rgba(217,164,65,0.25)';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(120, 1052);
  g.lineTo(W - 120, 1052);
  g.stroke();
  const stats = [
    [String(res.plies), '着法', false],
    [fmtTime(res.secs), '用时', false],
    [String(res.caps), '吃子', false],
    [String(res.undoCount), '悔棋', res.pure], // 零悔棋以金色高亮
  ];
  stats.forEach(([v, l, hi], i) => {
    const x = W / 2 + (i - 1.5) * 236;
    g.fillStyle = hi ? '#f2c14e' : '#e9decb';
    g.font = `800 64px ${sans}`;
    g.fillText(v, x, 1148);
    g.fillStyle = '#9a8a74';
    g.font = `600 26px ${sans}`;
    g.fillText(l, x, 1194);
  });

  g.fillStyle = '#d9a441';
  g.font = `700 34px ${sans}`;
  g.fillText('不 服 來 战', W / 2, 1262);
  g.fillStyle = '#9a8a74';
  g.font = `500 28px ${sans}`;
  g.fillText('chinese-chess.gh.miniasp.com', W / 2, 1306);

  return cv;
}

async function shareResult() {
  if (!lastResult) return;
  btnShare.disabled = true;
  const orig = btnShare.textContent;
  btnShare.textContent = '產生战绩圖…';
  try {
    const cv = await buildShareCard(lastResult);
    const blob = await new Promise((res) => cv.toBlob(res, 'image/png'));
    const file = new File([blob], 'chinese-chess-victory.png', { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text: lastResult.shareText });
        toast('分享成功，同喜同賀！🎉');
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return; // 使用者取消分享
        // 其餘错误改走下载后备方案
      }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'chinese-chess-victory.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    try {
      await navigator.clipboard.writeText(lastResult.shareText);
      toast('战绩圖已下载、炫耀文字已复制，贴上即可分享！');
    } catch {
      toast('战绩圖已下载，快分享你的胜利！');
    }
  } catch {
    toast('產生分享圖失敗，请再试一次');
  } finally {
    btnShare.disabled = false;
    btnShare.textContent = orig;
  }
}
btnShare.addEventListener('click', shareResult);

// ---------------- 按鈕 ----------------
btnLanCreate.addEventListener('click', lanCreateRoom);
btnLanJoin.addEventListener('click', lanJoinRoom);
btnLanLeave.addEventListener('click', () => {
  lanLeaveRoom();
  toast('已离开房间');
  newGame();
});

const modeSel = document.getElementById('modeSel');
mode = modeSel.value;
modeSel.addEventListener('change', () => {
  mode = modeSel.value;
  if (mode !== 'lan' && lanRoomCode) lanLeaveRoom();
  newGame(); // 换对手就开新局，避免局中切换造成混亂
});
document.getElementById('btnNew').addEventListener('click', newGame);
btnUndo.addEventListener('click', undo);
document.getElementById('btnSound').addEventListener('click', (e) => {
  muted = !muted;
  e.currentTarget.textContent = muted ? '音效：关' : '音效：开';
  e.currentTarget.setAttribute('aria-pressed', String(!muted));
});
// 「⋯」更多选单（小屏幕）：开合、点外处／Esc 关闭、玩法说明开关
const hudMore = document.getElementById('hudMore');
const btnMore = document.getElementById('btnMore');
const btnHelp = document.getElementById('btnHelp');
function closeHudMenu() {
  hudMore.classList.remove('open');
  btnMore.setAttribute('aria-expanded', 'false');
}
btnMore.addEventListener('click', () => {
  const open = hudMore.classList.toggle('open');
  btnMore.setAttribute('aria-expanded', String(open));
});
document.addEventListener('pointerdown', (e) => {
  if (hudMore.classList.contains('open') && !hudMore.contains(e.target) && !btnMore.contains(e.target)) closeHudMenu();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeHudMenu(); });
btnHelp.addEventListener('click', () => {
  const on = document.getElementById('left').classList.toggle('show-help');
  btnHelp.setAttribute('aria-pressed', String(on));
  closeHudMenu();
});
function flyTo(pos, tgt, done) {
  cancelCameraTween();
  const tgtFrom = controls.target.clone();
  // 以「球座标」補间（繞着目标水平环繞），直线 lerp 在 180° 换邊时
  // 相机会横越棋盘正上方，画面剧烈甩动、体感很差
  const sphFrom = new THREE.Spherical().setFromVector3(camera.position.clone().sub(tgtFrom));
  const sphTo = new THREE.Spherical().setFromVector3(pos.clone().sub(tgt));
  let dTheta = sphTo.theta - sphFrom.theta;
  // 取最短角距离；剛好半圈时固定逆时針，方向不会忽左忽右
  while (dTheta > Math.PI) dTheta -= Math.PI * 2;
  while (dTheta < -Math.PI) dTheta += Math.PI * 2;
  if (dTheta === -Math.PI) dTheta = Math.PI;
  // 旋转角度越大、補间越久，让换邊时节奏依然从容
  const dur = 480 + (Math.abs(dTheta) / Math.PI) * 480;
  tween(dur, (k) => {
    const tgtNow = tgtFrom.clone().lerp(tgt, k);
    const sph = new THREE.Spherical(
      sphFrom.radius + (sphTo.radius - sphFrom.radius) * k,
      sphFrom.phi + (sphTo.phi - sphFrom.phi) * k,
      sphFrom.theta + dTheta * k,
    );
    camera.position.setFromSpherical(sph).add(tgtNow);
    // 補间途中需自行更新相机朝向（tick 可能正跳过 controls.update()），
    // 否则抵達后视线方向是舊的
    camera.lookAt(tgtNow);
  }, () => { saveViewPrefs(); if (done) done(); }, 0, 'camera');
}
function cancelCameraTween() {
  for (let i = tweens.length - 1; i >= 0; i--) if (tweens[i].tag === 'camera') tweens.splice(i, 1);
}

// 「视角」按鈕：在多个预设机位之间循环切换
const CAMERA_VIEWS = [
  { label: '红方', dist: 0, polar: 45, azimuth: -90, tgt: HOME_TGT },
  { label: '黑方', dist: 0, polar: 45, azimuth: 90, tgt: new THREE.Vector3(0, -0.1, -0.2) },
  { label: '侧面', dist: 0, polar: 55, azimuth: 0, tgt: new THREE.Vector3(0, -0.1, 0.2) },
  { label: '俯视', dist: 0, polar: 8, azimuth: -90, tgt: new THREE.Vector3(0, 0, 0.2) },
];
let viewIdx = 0;
document.getElementById('btnView').addEventListener('click', () => {
  viewIdx = (viewIdx + 1) % CAMERA_VIEWS.length;
  const v = CAMERA_VIEWS[viewIdx];
  const dist = v.dist > 0 ? v.dist : fitDist || HOME_DIST;
  const pos = new THREE.Vector3()
    .setFromSphericalCoords(dist, THREE.MathUtils.degToRad(v.polar), THREE.MathUtils.degToRad(v.azimuth))
    .add(v.tgt);
  flyTo(pos, v.tgt);
  toast(`视角：${v.label}`);
});

// 固定视角：锁定镜头后拖曳／滚轮都不再改變视角（Issue #2）
let viewLocked = false;
const btnLock = document.getElementById('btnLock');
function syncLockUI() {
  controls.enabled = !viewLocked;
  document.getElementById('btnLockText').textContent = viewLocked ? '固定视角：开' : '固定视角：关';
  btnLock.setAttribute('aria-pressed', String(viewLocked));
  btnLock.classList.toggle('on', viewLocked);
}
btnLock.addEventListener('click', () => {
  viewLocked = !viewLocked;
  syncLockUI();
  saveViewPrefs();
  // 以「现狀」固定：冻结当下视角与进行中的相机補间，不做歸位
  if (viewLocked) cancelCameraTween();
});
syncLockUI();

// ---------------- 个人化：记住 3D 视角与固定视角设定（localStorage） ----------------
const VIEW_PREF_KEY = 'xiangqi.viewPrefs.v1';
let saveViewTimer = 0;
function saveViewPrefs() {
  try {
    localStorage.setItem(VIEW_PREF_KEY, JSON.stringify({
      pos: camera.position.toArray(),
      tgt: controls.target.toArray(),
      locked: viewLocked,
      viewIdx,
    }));
  } catch { /* 无法写入（如隐私模式）时靜默略过 */ }
}
function queueSaveViewPrefs() {
  clearTimeout(saveViewTimer);
  saveViewTimer = setTimeout(saveViewPrefs, 600); // 等惯性減速大致停止再存
}
function loadViewPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(VIEW_PREF_KEY) || 'null');
    const okVec = (a) => Array.isArray(a) && a.length === 3 && a.every(Number.isFinite);
    if (!p || !okVec(p.pos) || !okVec(p.tgt)) return null;
    return p;
  } catch { return null; }
}
// 启动时还原个人化设定
const savedPrefs = loadViewPrefs();
if (savedPrefs) {
  camera.position.fromArray(savedPrefs.pos);
  controls.target.fromArray(savedPrefs.tgt);
  camera.lookAt(controls.target);
  if (savedPrefs.locked) {
    viewLocked = true;
    syncLockUI();
  }
  if (Number.isInteger(savedPrefs.viewIdx)) {
    viewIdx = ((savedPrefs.viewIdx % CAMERA_VIEWS.length) + CAMERA_VIEWS.length) % CAMERA_VIEWS.length;
  }
  cameraUserAdjusted = true;
}
window.addEventListener('pagehide', saveViewPrefs);
document.getElementById('btnAgain').addEventListener('click', newGame);

// 全屏幕（含 Safari webkit 前綴）
const btnFull = document.getElementById('btnFull');
const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;
btnFull.addEventListener('click', async () => {
  try {
    if (fsElement()) {
      await (document.exitFullscreen?.() ?? document.webkitExitFullscreen?.());
    } else {
      const root = document.documentElement;
      await (root.requestFullscreen?.() ?? root.webkitRequestFullscreen?.());
    }
  } catch {
    /* 使用者拒絕或浏览器不支持时忽略 */
  }
});
function syncFullBtn() {
  const on = !!fsElement();
  btnFull.textContent = on ? '离开全屏幕' : '全屏幕';
  btnFull.setAttribute('aria-pressed', String(on));
}
document.addEventListener('fullscreenchange', syncFullBtn);
document.addEventListener('webkitfullscreenchange', syncFullBtn);
syncFullBtn();

// ---------------- resize / loop ----------------
function resize() {
  const w = container.clientWidth, h = container.clientHeight;
  if (w === 0 || h === 0) return;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  // 窄屏幕（尤其手机直拿）需要更远的镜头距离才能完整看到棋盘
  if (!cameraUserAdjusted) fitCameraToBoard();
}
new ResizeObserver(resize).observe(container);
resize();

function tick(now) {
  stepTweens(now);
  if (selRing.visible) {
    const s = 1 + Math.sin(now * 0.006) * 0.05;
    selRing.scale.set(s, s, 1);
  }
  if (!viewLocked) controls.update(); // 锁定时不套用控制器更新，惯性晃动一并冻结
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(tick);

newGame();
