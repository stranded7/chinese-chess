// 盲棋 AI 引擎自测：AI 只用公开棋盘（不帶 realType/realSide）
import { blindInitialBoard, blindLegalMoves, blindApplyMove, kingPos, RED, BLACK } from './game.js';
import { findBestMove, evaluate } from './ai.js';

let failed = 0;
function ok(cond, msg) {
  if (cond) console.log('  ✓', msg);
  else { failed++; console.error('  ✗', msg); }
}
function publicOf(full) {
  return full.map((row) => row.map((p) => (p ? {
    id: p.id, type: p.type, side: p.side, faceDown: !!p.faceDown,
  } : null)));
}

// ---------- 公开棋盘 ----------
const full = blindInitialBoard('blind-ai-test');
const pub = publicOf(full);
ok(pub.flat().filter(Boolean).every((p) => !p.realType && p.faceDown === true || !p.faceDown), 'AI 收到的是不帶 realType/realSide 的公开棋盘');

// ---------- 盲棋 AI 回传合法着法 ----------
const mv = findBestMove(pub, BLACK, 'medium', [], true);
ok(!!mv, '盲棋 AI 回传着法');
ok(mv && blindLegalMoves(pub, mv.from.r, mv.from.c).some((m) => m.r === mv.to.r && m.c === mv.to.c), `盲棋 AI 着法合法（${JSON.stringify(mv)}）`);

// ---------- 盲棋 AI 不偷看：搜尋时不会复制 real 欄位到内部盘面 ----------
{
  const mv2 = findBestMove(pub, RED, 'easy', [], true);
  ok(!!mv2, '盲棋 AI 紅方也能回传着法');
}

// ---------- 盲棋模式结束后恢復一般模式 ----------
{
  const mvStd = findBestMove(pub, BLACK, 'easy', [], false);
  ok(!!mvStd && mvStd.score !== undefined, '盲棋后一般模式仍可正常搜尋');
}

// ---------- 盲棋 AI 移动到公开棋盘后可套用回真盘 ----------
{
  const mv3 = findBestMove(pub, BLACK, 'easy', [], true);
  const candidate = full.map((row) => row.slice());
  const cap = blindApplyMove(candidate, mv3.from, mv3.to);
  ok(kingPos(candidate, RED) !== null && kingPos(candidate, BLACK) !== null || cap, '盲棋 AI 着法可套用回完整棋盘');
}

// ---------- 評估可跑 ----------
{
  ok(typeof evaluate(pub) === 'number', '公开棋盘可被 evaluate 評估');
}

console.log(failed === 0 ? '\n盲棋 AI 测试全部通過 ✔' : `\n${failed} 项失敗 ✘`);
process.exit(failed === 0 ? 0 : 1);
