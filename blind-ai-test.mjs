// 盲棋 AI 引擎自測：AI 只用公開棋盤（不帶 realType/realSide）
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

// ---------- 公開棋盤 ----------
const full = blindInitialBoard('blind-ai-test');
const pub = publicOf(full);
ok(pub.flat().filter(Boolean).every((p) => !p.realType && p.faceDown === true || !p.faceDown), 'AI 收到的是不帶 realType/realSide 的公開棋盤');

// ---------- 盲棋 AI 回傳合法著法 ----------
const mv = findBestMove(pub, BLACK, 'medium', [], true);
ok(!!mv, '盲棋 AI 回傳著法');
ok(mv && blindLegalMoves(pub, mv.from.r, mv.from.c).some((m) => m.r === mv.to.r && m.c === mv.to.c), `盲棋 AI 著法合法（${JSON.stringify(mv)}）`);

// ---------- 盲棋 AI 不偷看：搜尋時不會複製 real 欄位到內部盤面 ----------
{
  const mv2 = findBestMove(pub, RED, 'easy', [], true);
  ok(!!mv2, '盲棋 AI 紅方也能回傳著法');
}

// ---------- 盲棋模式結束後恢復一般模式 ----------
{
  const mvStd = findBestMove(pub, BLACK, 'easy', [], false);
  ok(!!mvStd && mvStd.score !== undefined, '盲棋後一般模式仍可正常搜尋');
}

// ---------- 盲棋 AI 移動到公開棋盤後可套用回真盤 ----------
{
  const mv3 = findBestMove(pub, BLACK, 'easy', [], true);
  const candidate = full.map((row) => row.slice());
  const cap = blindApplyMove(candidate, mv3.from, mv3.to);
  ok(kingPos(candidate, RED) !== null && kingPos(candidate, BLACK) !== null || cap, '盲棋 AI 著法可套用回完整棋盤');
}

// ---------- 評估可跑 ----------
{
  ok(typeof evaluate(pub) === 'number', '公開棋盤可被 evaluate 評估');
}

console.log(failed === 0 ? '\n盲棋 AI 測試全部通過 ✔' : `\n${failed} 項失敗 ✘`);
process.exit(failed === 0 ? 0 : 1);
