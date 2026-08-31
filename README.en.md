# Chinese Chess Blind Chess · Three.js 3D

A Three.js 3D Chinese Chess project focused on **Blind Chess (Xiangqi)**. It also keeps standard Chinese Chess, Human vs AI Blind Chess, and LAN Blind Chess modes.

## Blind Chess Rules

- The board is exactly the same as standard Chinese Chess. The two Kings (将/帅) remain fixed and face-up.
- The other 30 pieces are randomly placed on the 30 non-king starting squares.
- Red and Black pieces can appear on either side of the board.
- All non-king pieces start face-down.
- A face-down piece uses the full attributes of the original piece on its current starting square:
  - side / color;
  - movement;
  - capture rules;
  - river-crossing rules;
  - horse-leg, elephant-eye, cannon-screen restrictions.
- A face-down piece can move and can capture.
- Once a face-down piece moves, it is immediately revealed after the move.
- A captured face-down piece is revealed first, then removed.
- Blind Chess variant: advisors (士/仕) and elephants (象/相) may cross the river.
- A player wins only when the opponent's King/General is captured. Checkmate, stalemate and perpetual-check rules are not used in Blind Chess.

## Modes

| Mode | Description |
| --- | --- |
| Human vs AI (Easy / Medium / Hard) | Standard Chinese Chess AI |
| Two Players | Hot-seat local play |
| Blind Chess · Two Players | Local 2-player Blind Chess |
| Human vs Blind AI | You play Red; AI plays Black without seeing hidden identities |
| LAN Blind Chess | 2-player Blind Chess over LAN |

## Quick Start

### Local play

```bash
python -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

### LAN play (Radmin LAN works)

Start the built-in zero-dependency Node.js server:

```bash
node server.mjs
```

- Host opens `http://localhost:8080`.
- Host selects "联机 · 盲棋" (LAN Blind Chess) and clicks "建立房间" (Create Room).
- Friend opens `http://<your-Radmin-IP>:8080`.
- Friend selects "联机 · 盲棋" and enters the room code.

> Note: LAN mode requires `node server.mjs`. The `python -m http.server` static server does not provide the WebSocket channel.

## AI Fair-play Design

The Blind Chess AI only receives **public board information**:

- effective piece attributes: `type / side / faceDown`;
- **never** the hidden real identity fields `realType / realSide`.

The AI engine also strips those fields internally. It cannot "cheat" by knowing what a face-down piece really is.

## Tests

```bash
node test.mjs          # Standard Xiangqi engine tests
node blind-test.mjs    # Blind Chess rules tests
node blind-ai-test.mjs # Blind Chess AI tests
node fuzz.mjs          # 3000 random game fuzz tests
node ai-test.mjs       # AI engine tests
```

## Project Structure

```text
index.html         Layout and UI
css/style.css      3D board styles
game.js            Pure logic engine (standard + blind chess)
ai.js              AI search (negamax + alpha-beta, public-information blind mode)
server.mjs         LAN server (Node.js built-ins, WebSocket + static files)
main.js            Three.js scene, interaction and mode control
blind-test.mjs     Blind Chess rules tests
blind-ai-test.mjs  Blind Chess AI tests
```

## License

MIT License — see [LICENSE](LICENSE).

## Other Languages

- [简体中文](README.md)
- [繁體中文](README.zh-TW.md)
