// 引擎邏輯自测
import {
  initialBoard, legalMoves, inCheck, kingsFacing,
  applyMove, hasAnyLegalMove, name, notation, hashBoard, repetitionVerdict, RED, BLACK,
} from './game.js';

let failed = 0;
function ok(cond, msg) {
  if (cond) { console.log('  ✓', msg); }
  else { failed++; console.error('  ✗', msg); }
}
const fmt = (list) => list.map((m) => m.r + ',' + m.c).sort().join(' | ');
const emptyBoard = () => Array.from({ length: 10 }, () => Array(9).fill(null));

// ---------- 初始棋盘 ----------
let b = initialBoard();
let red = 0, blk = 0;
for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) {
  if (b[r][c] && b[r][c].side === RED) red++;
  if (b[r][c] && b[r][c].side === BLACK) blk++;
}
ok(red === 16 && blk === 16, `双方各 16 子（红 ${red} / 黑 ${blk}）`);

// ---------- 马（马）：蹩腿 ----------
let moves = legalMoves(b, 0, 1);
// (0,1)→(1,3) 的马腿(0,2) 被己方相塞住，故只剩 (2,0) 与 (2,2)
ok(fmt(moves) === '2,0 | 2,2', `初始红马(0,1) 走法  →  ${fmt(moves)}`);

// ---------- 车（车）：直线滑行 ----------
moves = legalMoves(b, 0, 0);
ok(fmt(moves) === '1,0 | 2,0', `初始红车(0,0) 走法  →  ${fmt(moves)}`);

// ---------- 炮：平走 + 翻山 ----------
moves = legalMoves(b, 2, 1);
ok(
  fmt(moves) === '1,1 | 2,0 | 2,2 | 2,3 | 2,4 | 2,5 | 2,6 | 3,1 | 4,1 | 5,1 | 6,1 | 9,1',
  `红炮(2,1)：平走至(2,6)、垂直平走、翻炮架(7,1)吃黑马(9,1)  →  ${fmt(moves)}`
);

// ---------- 兵 ----------
moves = legalMoves(b, 3, 4);
ok(fmt(moves) === '4,4', `红中兵过河前只可直进  →  ${fmt(moves)}`);

let b3 = initialBoard();
b3[5][4] = b3[3][4]; b3[3][4] = null; // 中兵推进到第 5 列（已过河）
moves = legalMoves(b3, 5, 4);
ok(fmt(moves) === '5,3 | 5,5 | 6,4', `过河红兵可直进、横走  →  ${fmt(moves)}`);

// ---------- 象：塞象眼 ----------
let b4 = initialBoard();
b4[1][3] = { type: 'P', side: RED }; // 塞住 (0,2) 跳 (2,4) 的象眼
moves = legalMoves(b4, 0, 2);
ok(!moves.some((m) => m.r === 2 && m.c === 4), `塞象眼后 (0,2) 不能跳 (2,4)（剩: ${fmt(moves)}）`);

// ---------- 白脸将（飛将） ----------
let bFace = emptyBoard();
bFace[0][4] = { type: 'K', side: RED };
bFace[9][4] = { type: 'K', side: BLACK };
ok(kingsFacing(bFace) === true, '同列无遮挡 → 对脸');
bFace[5][4] = { type: 'R', side: RED };
ok(kingsFacing(bFace) === false, '同列有遮挡 → 非对脸');
ok(inCheck(bFace, RED) === false, '有遮挡时不将');

bFace = bFace.map((row) => row.slice());
bFace[5][4] = null;
ok(inCheck(bFace, RED) === true, '对脸视同被将');

// 对脸时走开即解将
bFace[0][4] = null; bFace[0][3] = { type: 'K', side: RED };
ok(!inCheck(bFace, RED), '将走开后对脸解除');

// ---------- 被将 ----------
let bChk = emptyBoard();
bChk[0][4] = { type: 'K', side: RED };
bChk[9][4] = { type: 'K', side: BLACK };
bChk[8][4] = { type: 'R', side: BLACK };
ok(inCheck(bChk, RED) === true, '黑车(8,4) 同列压顶 → 红方被将');

// ---------- 合法走法过濾送将（仕被鎮压） ----------
let bPin = emptyBoard();
bPin[0][4] = { type: 'K', side: RED };
bPin[0][3] = { type: 'A', side: RED };
bPin[0][0] = { type: 'R', side: BLACK };
bPin[9][4] = { type: 'K', side: BLACK };
bPin[5][4] = { type: 'N', side: BLACK }; // 遮挡对脸
ok(inCheck(bPin, RED) === false, '仕挡炮口时红方未被将');
let advisorMoves = legalMoves(bPin, 0, 3);
ok(advisorMoves.length === 0, `离位即送将 → 仕无合法走法（剩: ${fmt(advisorMoves)}）`);

// ---------- 困毙（无子可动、未被将） ----------
let bStale = emptyBoard();
bStale[9][5] = { type: 'K', side: BLACK };          // 黑将
bStale[0][5] = { type: 'K', side: RED };            // 红帅（同列，需遮挡）
bStale[4][5] = { type: 'P', side: RED };            // 红兵遮挡对脸，并压住(5,5)
bStale[7][5] = { type: 'N', side: RED };            // 红马看住 (9,4) 与 (9,6)
bStale[8][0] = { type: 'R', side: RED };            // 红车看住 (8,5)
ok(inCheck(bStale, BLACK) === false, '困毙局面下黑方未被将');
ok(hasAnyLegalMove(bStale, BLACK) === false, '黑方困毙（(8,5)/(9,4)/(9,6) 全被看住，无子可动）');

// ---------- 将死（被将且无解）：双车锁底线 ----------
b = emptyBoard();
b[9][4] = { type: 'K', side: BLACK };   // 黑将
b[0][4] = { type: 'K', side: RED };     // 红帅（同列）
b[2][4] = { type: 'R', side: RED };     // 车(2,4) 垂直压顶＝将（同时遮挡对脸）
b[9][0] = { type: 'R', side: RED };     // 看住 (9,1)(9,2)(9,3)
b[9][8] = { type: 'R', side: RED };     // 看住 (9,5)(9,6)(9,7)
ok(inCheck(b, BLACK) === true, '红车(2,4) 压顶 → 黑方被将');
ok(hasAnyLegalMove(b, BLACK) === false, '黑将 (8,4)/(9,3)/(9,5) 均被看住 → 将死');

// ---------- 棋谱 notation ----------
b = initialBoard();
ok(notation(b, { r: 0, c: 1 }, { r: 2, c: 2 }) === '马八进七', `马八进七（实际: ${notation(b, { r: 0, c: 1 }, { r: 2, c: 2 })}）`);
b = initialBoard();
ok(notation(b, { r: 2, c: 7 }, { r: 2, c: 4 }) === '炮二平五', `炮二平五（实际: ${notation(b, { r: 2, c: 7 }, { r: 2, c: 4 })}）`);
b = initialBoard();
ok(notation(b, { r: 3, c: 4 }, { r: 4, c: 4 }) === '兵五进一', `兵五进一（实际: ${notation(b, { r: 3, c: 4 }, { r: 4, c: 4 })}）`);
b = initialBoard();
ok(notation(b, { r: 9, c: 1 }, { r: 7, c: 2 }) === '马二进三', `黑马二进三（实际: ${notation(b, { r: 9, c: 1 }, { r: 7, c: 2 })}）`);
b = initialBoard();
ok(notation(b, { r: 0, c: 7 }, { r: 2, c: 6 }) === '马二进三', `红马二进三（实际: ${notation(b, { r: 0, c: 7 }, { r: 2, c: 6 })}）`);
b = initialBoard();
const n7 = notation(b, { r: 0, c: 2 }, { r: 2, c: 4 });
ok(n7 === '相七进五', `相七进五（实际: ${n7}）`);
b = emptyBoard();
b[9][7] = { type: 'R', side: BLACK };
ok(notation(b, { r: 9, c: 7 }, { r: 7, c: 7 }) === '车八进二', `黑车八进二（朝红方方向＝进，实际: ${notation(b, { r: 9, c: 7 }, { r: 7, c: 7 })}）`);
b = emptyBoard();
b[0][0] = { type: 'R', side: RED };
ok(notation(b, { r: 0, c: 0 }, { r: 9, c: 0 }) === '车九进九', `红车九进九（实际: ${notation(b, { r: 0, c: 0 }, { r: 9, c: 0 })}）`);

// ---------- applyMove 吃子回传 ----------
b = initialBoard();
b[2][6] = { type: 'P', side: RED }; // 在(2,6)放个红兵
const cap = applyMove(b, { r: 2, c: 7 }, { r: 2, c: 6 });
ok(!!cap && cap.side === RED && cap.type === 'P', `炮(2,7)平(2,6) 吃红兵（实为 ${cap ? name(cap.side, cap.type) : '无'}）`);
b = initialBoard();
ok(applyMove(b, { r: 2, c: 1 }, { r: 1, c: 1 }) === null, '空位走子不回传被吃子');

// ---------- 三次重复局面：长将判负（红车沿列连照，黑将閃避） ----------
// 记录格式：{ key: hashBoard+'|'+轮走方, mover: 走该步的一方, check: 该步是否照将 }
let bPerp = emptyBoard();
bPerp[0][0] = { type: 'K', side: RED };
bPerp[7][0] = { type: 'R', side: RED };
bPerp[7][4] = { type: 'K', side: BLACK };
const repRecs = [{ key: hashBoard(bPerp) + '|black', mover: null, check: false }];
const repCycle = [
  [{ r: 7, c: 4 }, { r: 8, c: 4 }, BLACK], // 将閃避
  [{ r: 7, c: 0 }, { r: 8, c: 0 }, RED],   // 车照将
  [{ r: 8, c: 4 }, { r: 7, c: 4 }, BLACK], // 将閃避
  [{ r: 8, c: 0 }, { r: 7, c: 0 }, RED],   // 车照将
];
for (let cyc = 0; cyc < 2; cyc++)
  for (const [from, to, side] of repCycle) {
    applyMove(bPerp, from, to);
    repRecs.push({
      key: hashBoard(bPerp) + '|' + (side === RED ? 'black' : 'red'),
      mover: side,
      check: inCheck(bPerp, side === RED ? BLACK : RED),
    });
  }
ok(repRecs.filter((x) => x.key === repRecs[0].key).length === 3, '同一局面（含轮走方）出现三次');
const perp = repetitionVerdict(repRecs, repRecs[repRecs.length - 1].key);
ok(!!perp && perp.result === 'loss' && perp.loser === RED, `红方每步都照将 → 长将判负（实为 ${JSON.stringify(perp)}）`);

// ---------- 三次重复局面：无照将的循环 → 判和 ----------
let bRep = emptyBoard();
bRep[0][0] = { type: 'K', side: RED };
bRep[4][3] = { type: 'R', side: RED };
bRep[9][4] = { type: 'K', side: BLACK };
const drawRecs = [{ key: hashBoard(bRep) + '|black', mover: null, check: false }];
const drawCycle = [
  [{ r: 9, c: 4 }, { r: 9, c: 5 }, BLACK],
  [{ r: 4, c: 3 }, { r: 5, c: 3 }, RED],
  [{ r: 9, c: 5 }, { r: 9, c: 4 }, BLACK],
  [{ r: 5, c: 3 }, { r: 4, c: 3 }, RED],
];
for (let cyc = 0; cyc < 2; cyc++)
  for (const [from, to, side] of drawCycle) {
    applyMove(bRep, from, to);
    drawRecs.push({
      key: hashBoard(bRep) + '|' + (side === RED ? 'black' : 'red'),
      mover: side,
      check: inCheck(bRep, side === RED ? BLACK : RED),
    });
  }
const repDraw = repetitionVerdict(drawRecs, drawRecs[drawRecs.length - 1].key);
ok(!!repDraw && repDraw.result === 'draw' && repDraw.reason === '三次重复局面', `无照将的重复循环 → 判和（实为 ${JSON.stringify(repDraw)}）`);

// ---------- 双方皆长将 → 判和；仅两次重复 → 尚不判决 ----------
const bothRecs = [{ key: 'P|red', mover: null, check: false }];
for (let i = 0; i < 2; i++) {
  bothRecs.push({ key: 'Q|black', mover: RED, check: true });
  bothRecs.push({ key: 'P|red', mover: BLACK, check: true });
}
const both = repetitionVerdict(bothRecs, 'P|red');
ok(!!both && both.result === 'draw' && both.reason === '双方长将', `双方皆长将 → 判和（实为 ${JSON.stringify(both)}）`);

const twoRecs = [{ key: 'P|red', mover: null, check: false }];
twoRecs.push({ key: 'Q|black', mover: RED, check: true });
twoRecs.push({ key: 'P|red', mover: BLACK, check: false });
ok(repetitionVerdict(twoRecs, 'P|red') === null, '同一局面只出现两次 → 尚不判决');

console.log(failed === 0 ? '\n全部通过 ✔' : `\n${failed} 项失敗 ✘`);
process.exit(failed === 0 ? 0 : 1);
