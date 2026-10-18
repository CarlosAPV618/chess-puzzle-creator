// Ported from WintrCat/wintrchess (GPL-3.0) @ d145b20968955ca955cafe3fc3b51305f3bf41f9:
//   shared/src/lib/reporter/utils/attackers.ts
//   shared/src/lib/reporter/utils/defenders.ts
//   shared/src/lib/reporter/utils/pieceSafety.ts
//   shared/src/lib/reporter/utils/pieceTrapped.ts
//   shared/src/lib/reporter/utils/dangerLevels.ts
//   shared/src/lib/reporter/types/BoardPiece.ts, types/RawMove.ts, lib/utils/chess.ts (helpers)
// Merged into one file (the originals import each other circularly), strict TS,
// chess.js 1.4, no lodash. Danger-levels fixes: see `relativeUnsafePieceAttacks`
// and `hasDangerLevels`.
import { Chess, type Color, type Move, type PieceSymbol, type Square } from "chess.js";

export type BoardPiece = { square: Square; type: PieceSymbol; color: Color };
export type RawMove = {
  piece: PieceSymbol;
  color: Color;
  from: Square;
  to: Square;
  promotion?: PieceSymbol;
};

export const PIECE_VALUES: Record<PieceSymbol, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: Infinity,
};

const flip = (c: Color): Color => (c === "w" ? "b" : "w");

/** Sets the side to move; clears the en-passant square if the turn changes. */
export function setFenTurn(fen: string, color: Color): string {
  const parts = fen.split(" ");
  if (parts[1] !== color) parts[3] = "-";
  parts[1] = color;
  return parts.join(" ");
}

export function captureSquare(move: Move): Square {
  return move.isEnPassant() ? ((move.to[0]! + move.from[1]!) as Square) : move.to;
}

export function boardPieces(board: Chess): BoardPiece[] {
  return board.board().flat().filter((p): p is BoardPiece => p !== null);
}

const toRawMove = (m: Move): RawMove => ({
  piece: m.piece,
  color: m.color,
  from: m.from,
  to: m.to,
  promotion: m.promotion,
});

const toBoardPiece = (m: RawMove): BoardPiece => ({ type: m.piece, color: m.color, square: m.from });

const moveKey = (m: RawMove) => `${m.color}${m.piece}${m.from}${m.to}${m.promotion ?? ""}`;

function tryMove(board: Chess, m: RawMove | Move): Move | null {
  try {
    return board.move({ from: m.from, to: m.to, promotion: m.promotion });
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- attackers

function directAttackingMoves(board: Chess, piece: BoardPiece): RawMove[] {
  const opp = flip(piece.color);
  const scratch = new Chess(setFenTurn(board.fen(), opp));
  const attackerSquares = scratch.attackers(piece.square, opp);
  let attacking: RawMove[];

  if (scratch.fen().split(" ")[3] !== "-") {
    // En passant possible: use full (verbose, slow) move generation.
    attacking = scratch
      .moves({ verbose: true })
      .filter((m) => captureSquare(m) === piece.square)
      .map(toRawMove);
  } else {
    // Perf (not upstream): verbose move generation dominates the cost (chess.js
    // builds before/after FENs per move). Check each attacker's capture for
    // legality by simulating it and testing whether its king is attacked.
    const kingSquare = boardPieces(scratch).find((p) => p.type === "k" && p.color === opp)?.square;
    const target = scratch.get(piece.square);
    attacking = [];
    for (const from of attackerSquares) {
      const attacker = scratch.get(from);
      if (!attacker) continue;
      scratch.remove(from);
      scratch.put(attacker, piece.square);
      const king = attacker.type === "k" ? piece.square : kingSquare;
      const legal = !king || !scratch.isAttacked(king, piece.color);
      scratch.remove(piece.square);
      scratch.put(attacker, from);
      if (target) scratch.put(target, piece.square);
      if (!legal) continue;
      const lastRank = piece.square[1] === (opp === "w" ? "8" : "1");
      attacking.push({
        piece: attacker.type,
        color: opp,
        from,
        to: piece.square,
        promotion: attacker.type === "p" && lastRank ? "q" : undefined,
      });
    }
  }

  // A king "attacks" even when the capture would be illegal (defended piece).
  const kingAttacker = attackerSquares.find((sq) => scratch.get(sq)?.type === "k");
  if (kingAttacker && !attacking.some((m) => m.piece === "k")) {
    attacking.push({ piece: "k", color: opp, from: kingAttacker, to: piece.square });
  }
  return attacking;
}

/** Attacking moves on `piece`, including x-ray (battery) attackers if `transitive`. */
export function getAttackingMoves(board: Chess, piece: BoardPiece, transitive = true): RawMove[] {
  const attacking = directAttackingMoves(board, piece);
  if (!transitive) return attacking;

  const frontier = attacking.map((m) => ({ fen: board.fen(), square: m.from, type: m.piece }));
  while (frontier.length > 0) {
    const t = frontier.pop()!;
    if (t.type === "k") continue; // a king cannot be at the front of a battery
    const tBoard = new Chess(t.fen);
    const oldMoves = directAttackingMoves(tBoard, piece).filter((m) => m.from !== t.square);
    tBoard.remove(t.square);
    const newMoves = directAttackingMoves(tBoard, piece);

    // Revealed attackers = symmetric difference of old (front piece excluded) and new.
    const oldKeys = new Set(oldMoves.map(moveKey));
    const newKeys = new Set(newMoves.map(moveKey));
    const revealed = [
      ...oldMoves.filter((m) => !newKeys.has(moveKey(m))),
      ...newMoves.filter((m) => !oldKeys.has(moveKey(m))),
    ];
    attacking.push(...revealed);
    const fen = tBoard.fen();
    frontier.push(...revealed.map((m) => ({ fen, square: m.from, type: m.piece })));
  }
  return attacking;
}

// ---------------------------------------------------------------- defenders

export function getDefendingMoves(board: Chess, piece: BoardPiece, transitive = true): RawMove[] {
  const fen = board.fen();
  const attacking = getAttackingMoves(board, piece, false);

  // Simulate taking the piece with each attacker; keep the smallest recapture set.
  let smallest: RawMove[] | undefined;
  for (const attack of attacking) {
    const captureBoard = new Chess(setFenTurn(fen, flip(piece.color)));
    if (!tryMove(captureBoard, attack)) continue;
    const recapturers = getAttackingMoves(
      captureBoard,
      { type: attack.piece, color: attack.color, square: attack.to },
      transitive,
    );
    if (!smallest || recapturers.length < smallest.length) smallest = recapturers;
  }
  if (smallest) return smallest;

  // No attackers: flip the piece's colour and count who attacks it.
  const defenderBoard = new Chess(fen);
  const flipped: BoardPiece = { ...piece, color: flip(piece.color) };
  defenderBoard.put({ type: flipped.type, color: flipped.color }, piece.square);
  return getAttackingMoves(defenderBoard, flipped, transitive);
}

// ---------------------------------------------------------------- safety

// ponytail: global memo, cleared wholesale when big; same position + piece => same answer.
const safetyMemo = new Map<string, boolean>();

export function isPieceSafe(board: Chess, piece: BoardPiece, playedMove?: Move): boolean {
  // Fast path (not upstream): no pseudo-attacker means no attacking move at all.
  if (!board.isAttacked(piece.square, flip(piece.color))) return true;
  const key = `${board.fen()}|${piece.square}${piece.type}${piece.color}|${playedMove?.captured ?? ""}`;
  let safe = safetyMemo.get(key);
  if (safe === undefined) {
    if (safetyMemo.size > 20_000) safetyMemo.clear();
    safe = computePieceSafe(board, piece, playedMove);
    safetyMemo.set(key, safe);
  }
  return safe;
}

function computePieceSafe(board: Chess, piece: BoardPiece, playedMove?: Move): boolean {
  const directAttackers = getAttackingMoves(board, piece, false).map(toBoardPiece);
  const attackers = getAttackingMoves(board, piece).map(toBoardPiece);
  const defenders = getDefendingMoves(board, piece).map(toBoardPiece);

  // Favourable decimal sacrifices (rook for two minor pieces etc.) are safe.
  if (
    playedMove?.captured &&
    piece.type === "r" &&
    PIECE_VALUES[playedMove.captured] === PIECE_VALUES.n &&
    attackers.length === 1 &&
    defenders.length > 0 &&
    PIECE_VALUES[attackers[0]!.type] === PIECE_VALUES.n
  ) {
    return true;
  }

  // A direct attacker of lower value makes it unsafe.
  if (directAttackers.some((a) => PIECE_VALUES[a.type] < PIECE_VALUES[piece.type])) return false;

  // Not more attackers than defenders: safe.
  if (attackers.length <= defenders.length) return true;

  let lowest: BoardPiece | undefined;
  for (const a of directAttackers) {
    if (!lowest || PIECE_VALUES[a.type] < PIECE_VALUES[lowest.type]) lowest = a;
  }
  if (!lowest) return true;

  // Cheaper than every attacker and defended by something cheaper than every attacker.
  if (
    PIECE_VALUES[piece.type] < PIECE_VALUES[lowest.type] &&
    defenders.some((d) => PIECE_VALUES[d.type] < PIECE_VALUES[lowest.type])
  ) {
    return true;
  }

  // Defended by a pawn: safe.
  return defenders.some((d) => d.type === "p");
}

/** Own non-pawn, non-king pieces that are unsafe and worth more than what was just captured. */
export function getUnsafePieces(board: Chess, color: Color, playedMove?: Move): BoardPiece[] {
  const capturedValue = playedMove?.captured ? PIECE_VALUES[playedMove.captured] : 0;
  return boardPieces(board).filter(
    (p) =>
      p.color === color &&
      p.type !== "p" &&
      p.type !== "k" &&
      PIECE_VALUES[p.type] > capturedValue &&
      !isPieceSafe(board, p, playedMove),
  );
}

// ---------------------------------------------------------------- danger levels

/**
 * Attacks on unsafe pieces of `color` worth >= the threatened piece.
 *
 * Fix vs. upstream: upstream always excluded the threatened piece's square, but
 * after a capture that square holds the *capturing* piece, whose hanging must
 * count. Now only the threatened piece itself is excluded (`exclude`: its square
 * before the acting move, its new square if it moved, null if it was captured).
 */
function relativeUnsafePieceAttacks(
  board: Chess,
  threatened: BoardPiece,
  color: Color,
  exclude: Square | null,
  playedMove?: Move,
): RawMove[] {
  return getUnsafePieces(board, color, playedMove)
    .filter((p) => p.square !== exclude && PIECE_VALUES[p.type] >= PIECE_VALUES[threatened.type])
    .flatMap((p) => getAttackingMoves(board, p, false));
}

/** After `acting`, the square the threatened piece occupies (null if it was captured). */
function threatenedSquareAfter(threatened: BoardPiece, acting: RawMove): Square | null {
  if (acting.from === threatened.square) return acting.to;
  if (acting.to === threatened.square) return null;
  return threatened.square;
}

function hasMateInOne(board: Chess): boolean {
  return board.moves().some((san) => san.includes("#"));
}

/**
 * Assuming `threatened` is under threat, play `acting` (e.g. the opponent capturing
 * it, or the piece escaping). True if that creates a counter-threat >= the piece.
 */
export function moveCreatesGreaterThreat(board: Chess, threatened: BoardPiece, acting: RawMove): boolean {
  const actionBoard = new Chess(board.fen());
  const previous = relativeUnsafePieceAttacks(actionBoard, threatened, acting.color, threatened.square);
  const baked = tryMove(actionBoard, acting);
  if (!baked) return false;

  const after = relativeUnsafePieceAttacks(
    actionBoard,
    threatened,
    acting.color,
    threatenedSquareAfter(threatened, acting),
    baked,
  );
  const prevKeys = new Set(previous.map(moveKey));
  if (after.some((m) => !prevKeys.has(moveKey(m)))) return true;

  // Lower-value piece sacrifice that, if taken, allows mate in one.
  return PIECE_VALUES[threatened.type] < PIECE_VALUES.q && hasMateInOne(actionBoard);
}

export function moveLeavesGreaterThreat(board: Chess, threatened: BoardPiece, acting: RawMove): boolean {
  const actionBoard = new Chess(board.fen());
  if (!tryMove(actionBoard, acting)) return false;

  const after = relativeUnsafePieceAttacks(
    actionBoard,
    threatened,
    acting.color,
    threatenedSquareAfter(threatened, acting),
  );
  if (after.length > 0) return true;

  return PIECE_VALUES[threatened.type] < PIECE_VALUES.q && hasMateInOne(actionBoard);
}

/**
 * True if every acting move (e.g. every capture of the piece) leaves/creates a greater threat.
 * Fix vs. upstream: illegal acting moves (the king "attacker" added by
 * `directAttackingMoves` when the piece is defended) used to count as "no greater
 * threat", which made a defended piece look like a real sacrifice. They are skipped.
 */
export function hasDangerLevels(
  board: Chess,
  threatened: BoardPiece,
  actingMoves: RawMove[],
  strategy: "creates" | "leaves" = "leaves",
): boolean {
  return actingMoves.filter((m) => tryMove(new Chess(board.fen()), m)).every((m) =>
    strategy === "creates"
      ? moveCreatesGreaterThreat(board, threatened, m)
      : moveLeavesGreaterThreat(board, threatened, m),
  );
}

// ---------------------------------------------------------------- trapped

/** Unsafe where it stands and on every square it can move to (or moving it allows a greater threat). */
export function isPieceTrapped(board: Chess, piece: BoardPiece, dangerLevels = true): boolean {
  const calibrated = new Chess(setFenTurn(board.fen(), piece.color));
  if (isPieceSafe(calibrated, piece)) return false;

  return calibrated.moves({ square: piece.square, verbose: true }).every((move) => {
    if (move.captured === "k") return false;
    const escapeBoard = new Chess(calibrated.fen());
    if (dangerLevels && moveCreatesGreaterThreat(escapeBoard, piece, move)) return true;
    const escape = tryMove(escapeBoard, move);
    if (!escape) return true;
    return !isPieceSafe(escapeBoard, { ...piece, square: escape.to }, escape);
  });
}
