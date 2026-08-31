// AI 搜索在 Worker 執行，避免深層搜索卡住畫面
import { findBestMove } from './ai.js?v=59148e32a3';

self.onmessage = (e) => {
  const { board, side, level, token, recent, blind } = e.data;
  const t0 = Date.now();
  let result = null;
  try {
    result = findBestMove(board, side, level, recent, !!blind);
  } catch (err) {
    self.postMessage({ token, error: String(err) });
    return;
  }
  self.postMessage({ token, result, timeMs: Date.now() - t0 });
};
