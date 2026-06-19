'use client';

import React, { useState, useMemo, useCallback } from 'react';
import GoBoard from '@/components/GoBoard';
import { GameState, Position, Stone, createGame, placeStone } from '@/lib/game-engine';

interface GameReplayProps {
  initialState: GameState;
  onClose: () => void;
}

export default function GameReplay({ initialState, onClose }: GameReplayProps) {
  const [moveIndex, setMoveIndex] = useState(0);

  const moves = initialState.moveHistory;

  // 각 수순별 보드 상태를 미리 계산
  const boardStates = useMemo(() => {
    const states: { board: Stone[][]; lastMove: Position | null }[] = [];
    let state = createGame(initialState.boardSize, initialState.komi);
    states.push({ board: state.board.map(r => [...r]), lastMove: null });

    for (const move of moves) {
      if (move.position) {
        const next = placeStone(state, move.position);
        if (next) {
          state = next;
          states.push({ board: state.board.map(r => [...r]), lastMove: move.position });
        }
      } else {
        // 패스
        state = { ...state, currentPlayer: state.currentPlayer === 'black' ? 'white' : 'black' as Stone };
        states.push({ board: state.board.map(r => [...r]), lastMove: null });
      }
    }
    return states;
  }, [initialState, moves]);

  const current = boardStates[moveIndex] || boardStates[0];

  const goFirst = () => setMoveIndex(0);
  const goPrev = () => setMoveIndex(i => Math.max(0, i - 1));
  const goNext = () => setMoveIndex(i => Math.min(boardStates.length - 1, i + 1));
  const goLast = () => setMoveIndex(boardStates.length - 1);

  // 더미 gameState (GoBoard가 필요로 하는 형태)
  const dummyState = useMemo(() => createGame(initialState.boardSize), [initialState.boardSize]);

  return (
    <div className="min-h-dvh bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950 flex flex-col items-center px-3 py-4">
      <div className="w-full max-w-[500px] space-y-3">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 transition-colors text-sm flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            돌아가기
          </button>
          <h1 className="text-white font-bold text-base">대국 리플레이</h1>
          <div className="text-gray-500 text-xs">
            {moveIndex}/{boardStates.length - 1}수
          </div>
        </div>

        {/* 보드 */}
        <GoBoard
          gameState={dummyState}
          onPlaceStone={() => {}}
          lastMove={current.lastMove}
          displayBoard={current.board}
          mode="replay"
          replayMoveIndex={moveIndex > 0 ? moveIndex : undefined}
        />

        {/* 수순 정보 */}
        {moveIndex > 0 && moves[moveIndex - 1] && (
          <div className="text-center text-gray-400 text-xs">
            {moves[moveIndex - 1].player === 'black' ? '흑' : '백'}
            {moves[moveIndex - 1].position
              ? (() => {
                  const col = moves[moveIndex - 1].position!.col;
                  const letters = 'ABCDEFGHJKLMNOPQRST';
                  return ` - ${letters[col]}${initialState.boardSize - moves[moveIndex - 1].position!.row}`;
                })()
              : ' - 패스'}
          </div>
        )}

        {/* 컨트롤 */}
        <div className="flex items-center justify-center gap-2">
          <button onClick={goFirst} className="p-3 rounded-xl bg-gray-800 text-gray-400 hover:bg-gray-700 active:scale-95 transition-all">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
          </button>
          <button onClick={goPrev} className="p-3 rounded-xl bg-gray-800 text-gray-400 hover:bg-gray-700 active:scale-95 transition-all">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="px-4 py-2 rounded-xl bg-gray-900 text-white font-mono font-bold text-lg min-w-[80px] text-center">
            {moveIndex}
          </div>
          <button onClick={goNext} className="p-3 rounded-xl bg-gray-800 text-gray-400 hover:bg-gray-700 active:scale-95 transition-all">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <button onClick={goLast} className="p-3 rounded-xl bg-gray-800 text-gray-400 hover:bg-gray-700 active:scale-95 transition-all">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* 프로그레스 바 */}
        <div className="px-2">
          <input
            type="range"
            min={0}
            max={boardStates.length - 1}
            value={moveIndex}
            onChange={e => setMoveIndex(Number(e.target.value))}
            className="w-full h-2 bg-gray-800 rounded-full appearance-none cursor-pointer
                       [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5
                       [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full
                       [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:shadow-lg"
          />
        </div>
      </div>
    </div>
  );
}
