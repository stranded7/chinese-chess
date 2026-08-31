// 盲棋规则引擎自测
import {
  ROWS, COLS, RED, BLACK,
  initialBoard, blindInitialBoard, blindLegalMoves, blindApplyMove,
  snapshotPiece, kingPos, hashBoard,
} from './game.js';

let failed = 0;
function ok(cond, msg) {
  if (cond) console.log('  ✓', msg);
  else { failed++; console.error('  ✗', msg); }
}

function emptyBlindBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}
function faceDown(p, type, side, realType, realSide) {
  return { type, side, realType, realSide, faceDown: true };
}
function open(p, type, side) {
  return { type, side, realType: type, realSide: side, faceDown: false };
}

// ---------- 初始盲棋棋盘 ----------
const b = blindInitialBoard('blind-test-seed');
let faceCount = 0, kingVisible = 0;
const realCount = {};
for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
  const p = b[r][c];
  if (!p) continue;
  if (p.faceDown) faceCount++;
  if (!p.faceDown) kingVisible++;
  if (p.realType !== 'K') realCount[p.realSide + ':' + p.realType] = (realCount[p.realSide + ':' + p.realType] || 0) + 1;
}
ok(faceCount === 30, `初始 30 个非将帅棋子均為暗子（${faceCount}）`);
ok(kingVisible === 2, `仅将/帅為明置（${kingVisible}）`);
ok(kingPos(b, RED).r === 0 && kingPos(b, RED).c === 4, '紅帅固定 (0,4)');
ok(kingPos(b, BLACK).r === 9 && kingPos(b, BLACK).c === 4, '黑将固定 (9,4)');
const std = initialBoard();
const stdReal = {};
for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
  const p = std[r][c];
  if (p && p.type !== 'K') stdReal[p.side + ':' + p.type] = (stdReal[p.side + ':' + p.type] || 0) + 1;
}
const norm = (obj) => JSON.stringify(Object.entries(obj).sort((a, b) => a[0].localeCompare(b[0])));
ok(norm(realCount) === norm(stdReal), `真實棋子种类数量与标准象棋一致（${norm(realCount)}）`);

// ---------- 种子可重现 ----------
const b2 = blindInitialBoard('blind-test-seed');
ok(hashBoard(b) === hashBoard(b2), '相同种子產生相同棋盘');
const b3 = blindInitialBoard('other-seed');
ok(hashBoard(b) !== hashBoard(b3), '不同种子產生不同棋盘');

// ---------- 暗子合法走法使用「有效屬性」 ----------
let tb = emptyBlindBoard();
tb[0][4] = open({}, 'K', RED); // 紅帅
tb[9][4] = open({}, 'K', BLACK); // 黑将
// 紅暗子放在(2,1)（原始紅炮位），有效屬性=炮，但真實是黑车
tb[2][1] = faceDown({}, 'C', RED, 'R', BLACK);
const moves = blindLegalMoves(tb, 2, 1);
ok(moves.some((m) => m.r === 9 && m.c === 1), '暗炮在(2,1)依有效屬性可翻山到(9,1)');
ok(moves.some((m) => m.r === 1 && m.c === 1), '暗炮可平移一格');
ok(moves.length >= 10, `暗炮走法数量合理（${moves.length}）`);

// ---------- 暗子移动后立即翻开 ----------
let moveBoard = emptyBlindBoard();
moveBoard[0][4] = open({}, 'K', RED);
moveBoard[9][4] = open({}, 'K', BLACK);
const dark = faceDown({}, 'P', RED, 'N', BLACK);
moveBoard[1][4] = dark;
const from = { r: 1, c: 4 }, to = { r: 2, c: 4 };
const cap = blindApplyMove(moveBoard, from, to);
ok(cap === null, '空位移动無被吃子');
ok(moveBoard[2][4] === dark, '暗子移动到目标格');
ok(dark.faceDown === false, '暗子移动后立即翻开');
ok(dark.side === BLACK && dark.type === 'N', `翻开后恢復真實身份（${dark.side}/${dark.type}）`);

// ---------- 暗子吃子时，被吃暗子先翻开再移除 ----------
let capBoard = emptyBlindBoard();
capBoard[0][4] = open({}, 'K', RED);
capBoard[9][4] = open({}, 'K', BLACK);
const moving = faceDown({}, 'R', RED, 'R', RED);
const target = faceDown({}, 'B', BLACK, 'N', RED);
capBoard[1][0] = moving;
capBoard[1][8] = target;
const captured = blindApplyMove(capBoard, { r: 1, c: 0 }, { r: 1, c: 8 });
ok(captured === target, '回传被吃暗子');
ok(captured.faceDown === false, '被吃暗子翻开后才移除');
ok(captured.side === RED && captured.type === 'N', `被吃暗子公开真實身份（${captured.side}/${captured.type}）`);
ok(capBoard[1][8] === moving && moving.faceDown === false, '移动暗子吃子后也翻开');

// ---------- 盲棋變体：士／象可以過河 ----------
let riverBoard = emptyBlindBoard();
riverBoard[0][4] = open({}, 'K', RED);
riverBoard[9][4] = open({}, 'K', BLACK);
riverBoard[0][0] = open({}, 'A', RED); // 紅仕放在(0,0)，已不在九宮
const advisorMoves = blindLegalMoves(riverBoard, 0, 0);
ok(advisorMoves.some((m) => m.r === 1 && m.c === 1), '盲棋紅仕不在九宮仍可斜走(1,1)');
ok(!advisorMoves.some((m) => m.r === 2 && m.c === 0), '盲棋紅仕仍只斜走一步，不会直走');

riverBoard[4][0] = open({}, 'B', RED); // 紅相在河沿，跳向黑方
riverBoard[5][1] = null; // 确保象眼通畅
const elephantMoves = blindLegalMoves(riverBoard, 4, 0);
ok(elephantMoves.some((m) => m.r === 6 && m.c === 2), '盲棋紅相可以過河跳到(6,2)');

// 塞象眼仍然有效
riverBoard[5][1] = open({}, 'P', RED);
const blockedElephant = blindLegalMoves(riverBoard, 4, 0);
ok(!blockedElephant.some((m) => m.r === 6 && m.c === 2), '過河象仍受塞象眼限制');

// ---------- 控制权快照可供悔棋 ----------
const snap = snapshotPiece(dark);
ok(snap.faceDown === false && snap.type === 'N' && snap.side === BLACK, '快照记录明子狀态');
const snap2 = snapshotPiece(faceDown({}, 'P', RED, 'N', BLACK));
ok(snap2.faceDown === true && snap2.type === 'P' && snap2.side === RED && snap2.realType === 'N' && snap2.realSide === BLACK, '快照记录暗子有效与真實身份');

console.log(failed === 0 ? '\n盲棋测试全部通過 ✔' : `\n${failed} 项失敗 ✘`);
process.exit(failed === 0 ? 0 : 1);
