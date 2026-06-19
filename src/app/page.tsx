'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import GoBoard from '@/components/GoBoard';
import GamePanel from '@/components/GamePanel';
import {
  GameState,
  Position,
  Stone,
  createGame,
  placeStone,
  pass,
  calculateScore,
} from '@/lib/game-engine';
import { Difficulty, getAIMove } from '@/lib/ai-engine';

type GameMode = 'menu' | 'playing';

export default function Home() {
  const [mode, setMode] = useState<GameMode>('menu');
  const [gameState, setGameState] = useState<GameState>(createGame(9));
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [boardSize, setBoardSize] = useState(9);
  const [playerColor, setPlayerColor] = useState<Stone>('black');
  const [isAIThinking, setIsAIThinking] = useState(false);
  const [scoreInfo, setScoreInfo] = useState<ReturnType<typeof calculateScore> | null>(null);
  const [lastMove, setLastMove] = useState<Position | null>(null);
  const aiTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 게임 종료 시 점수 계산
  useEffect(() => {
    if (gameState.isGameOver) {
      setScoreInfo(calculateScore(gameState));
    }
  }, [gameState.isGameOver, gameState]);

  // AI 차례 처리
  const doAIMove = useCallback(
    (state: GameState) => {
      if (state.isGameOver) return;

      setIsAIThinking(true);
      const delay = difficulty === 'hard' ? 800 : difficulty === 'medium' ? 500 : 300;

      aiTimeoutRef.current = setTimeout(() => {
        const aiPos = getAIMove(state, difficulty);
        if (aiPos) {
          const newState = placeStone(state, aiPos);
          if (newState) {
            setGameState(newState);
            setLastMove(aiPos);
          } else {
            setGameState(pass(state));
          }
        } else {
          setGameState(pass(state));
        }
        setIsAIThinking(false);
      }, delay);
    },
    [difficulty]
  );

  // AI 차례 감지
  useEffect(() => {
    if (
      mode === 'playing' &&
      !gameState.isGameOver &&
      gameState.currentPlayer !== playerColor &&
      !isAIThinking
    ) {
      doAIMove(gameState);
    }
  }, [gameState, playerColor, isAIThinking, mode, doAIMove]);

  useEffect(() => {
    return () => {
      if (aiTimeoutRef.current) clearTimeout(aiTimeoutRef.current);
    };
  }, []);

  const handlePlaceStone = (pos: Position) => {
    if (isAIThinking || gameState.isGameOver) return;
    if (gameState.currentPlayer !== playerColor) return;

    const newState = placeStone(gameState, pos);
    if (newState) {
      setGameState(newState);
      setLastMove(pos);
    }
  };

  const handlePass = () => {
    if (isAIThinking || gameState.isGameOver) return;
    setGameState(pass(gameState));
    setLastMove(null);
  };

  const handleResign = () => {
    const resigned = { ...gameState, isGameOver: true, consecutivePasses: 2 };
    setGameState(resigned);
  };

  const startGame = (color: Stone) => {
    if (aiTimeoutRef.current) clearTimeout(aiTimeoutRef.current);
    setPlayerColor(color);
    setGameState(createGame(boardSize));
    setScoreInfo(null);
    setLastMove(null);
    setIsAIThinking(false);
    setMode('playing');
  };

  const handleNewGame = () => {
    if (aiTimeoutRef.current) clearTimeout(aiTimeoutRef.current);
    setIsAIThinking(false);
    setMode('menu');
    setScoreInfo(null);
    setLastMove(null);
  };

  const handleBoardSizeChange = (size: number) => {
    setBoardSize(size);
    if (mode === 'playing') {
      if (aiTimeoutRef.current) clearTimeout(aiTimeoutRef.current);
      setIsAIThinking(false);
      setGameState(createGame(size));
      setScoreInfo(null);
      setLastMove(null);
    }
  };

  const handleDifficultyChange = (d: Difficulty) => {
    setDifficulty(d);
  };

  // ── 메인 메뉴 ──
  if (mode === 'menu') {
    return (
      <main className="min-h-dvh bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950 flex flex-col items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm space-y-6">
          {/* 로고 */}
          <div className="text-center space-y-2">
            <div className="relative inline-block">
              <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-amber-700 to-amber-900 flex items-center justify-center shadow-2xl shadow-amber-900/30">
                <div className="grid grid-cols-3 gap-1">
                  <div className="w-3 h-3 rounded-full bg-black shadow-inner" />
                  <div className="w-3 h-3 rounded-full bg-white shadow-inner" />
                  <div className="w-3 h-3 rounded-full bg-black shadow-inner" />
                  <div className="w-3 h-3 rounded-full bg-white shadow-inner" />
                  <div className="w-3 h-3 rounded-full bg-black shadow-inner" />
                  <div className="w-3 h-3 rounded-full bg-white shadow-inner" />
                  <div className="w-3 h-3 rounded-full bg-white shadow-inner" />
                  <div className="w-3 h-3 rounded-full bg-black shadow-inner" />
                  <div className="w-3 h-3 rounded-full bg-white shadow-inner" />
                </div>
              </div>
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight">성빈이와 바둑하기</h1>
            <p className="text-gray-500 text-sm">표준 규칙 기반 AI 대국</p>
          </div>

          {/* 바둑판 크기 */}
          <div className="space-y-2">
            <label className="text-gray-500 text-xs font-medium">바둑판 크기</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { size: 9, label: '9x9', desc: '입문' },
                { size: 13, label: '13x13', desc: '중급' },
                { size: 19, label: '19x19', desc: '정식' },
              ].map(b => (
                <button
                  key={b.size}
                  onClick={() => setBoardSize(b.size)}
                  className={`py-3 rounded-xl transition-all active:scale-95 ${
                    boardSize === b.size
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/40'
                      : 'bg-gray-800/80 text-gray-400 hover:bg-gray-700/80'
                  }`}
                >
                  <div className="font-bold text-base">{b.label}</div>
                  <div className="text-[10px] opacity-60">{b.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* AI 난이도 */}
          <div className="space-y-2">
            <label className="text-gray-500 text-xs font-medium">AI 난이도</label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { key: 'easy' as Difficulty, label: '하', desc: '입문자' },
                { key: 'medium' as Difficulty, label: '중', desc: '중급자' },
                { key: 'hard' as Difficulty, label: '상', desc: '고급자' },
              ]).map(d => (
                <button
                  key={d.key}
                  onClick={() => setDifficulty(d.key)}
                  className={`py-3 rounded-xl transition-all active:scale-95 ${
                    difficulty === d.key
                      ? d.key === 'easy'
                        ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/40'
                        : d.key === 'medium'
                          ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/40'
                          : 'bg-red-600 text-white shadow-lg shadow-red-600/40'
                      : 'bg-gray-800/80 text-gray-400 hover:bg-gray-700/80'
                  }`}
                >
                  <div className="font-bold text-sm">{d.label}</div>
                  <div className="text-[10px] opacity-60">{d.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 돌 색 선택 & 시작 */}
          <div className="space-y-2">
            <label className="text-gray-500 text-xs font-medium">돌 색 선택</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => startGame('black')}
                className="group py-4 rounded-xl bg-gradient-to-b from-gray-800 to-gray-900
                           hover:from-gray-700 hover:to-gray-800
                           border border-gray-700/50 transition-all active:scale-95
                           shadow-lg hover:shadow-xl"
              >
                <div className="w-10 h-10 mx-auto rounded-full bg-gradient-to-br from-gray-600 to-black shadow-lg mb-2
                                group-hover:shadow-gray-600/30" />
                <div className="text-white font-bold">흑으로 시작</div>
                <div className="text-gray-500 text-[10px]">선수 (먼저 둠)</div>
              </button>
              <button
                onClick={() => startGame('white')}
                className="group py-4 rounded-xl bg-gradient-to-b from-gray-800 to-gray-900
                           hover:from-gray-700 hover:to-gray-800
                           border border-gray-700/50 transition-all active:scale-95
                           shadow-lg hover:shadow-xl"
              >
                <div className="w-10 h-10 mx-auto rounded-full bg-gradient-to-br from-white to-gray-300 shadow-lg mb-2
                                group-hover:shadow-white/20" />
                <div className="text-white font-bold">백으로 시작</div>
                <div className="text-gray-500 text-[10px]">후수 (덤 6.5점)</div>
              </button>
            </div>
          </div>
        </div>

        <footer className="mt-8 text-gray-700 text-[10px]">
          표준 바둑 규칙 (한국기원) 적용
        </footer>
      </main>
    );
  }

  // ── 게임 화면 ──
  return (
    <main className="min-h-dvh bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950 flex flex-col items-center px-3 py-4">
      <div className="w-full max-w-[500px] space-y-3">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <button
            onClick={handleNewGame}
            className="text-gray-500 hover:text-gray-300 transition-colors text-sm flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            메뉴
          </button>
          <h1 className="text-white font-bold text-base">
            바둑 {boardSize}x{boardSize}
          </h1>
          <div className="text-gray-600 text-xs">
            {difficulty === 'easy' ? '하' : difficulty === 'medium' ? '중' : '상'}
          </div>
        </div>

        {/* 바둑판 */}
        <GoBoard
          gameState={gameState}
          onPlaceStone={handlePlaceStone}
          lastMove={lastMove}
        />

        {/* 게임 패널 */}
        <GamePanel
          gameState={gameState}
          difficulty={difficulty}
          onDifficultyChange={handleDifficultyChange}
          onPass={handlePass}
          onResign={handleResign}
          onNewGame={handleNewGame}
          onBoardSizeChange={handleBoardSizeChange}
          isAIThinking={isAIThinking}
          playerColor={playerColor}
          scoreInfo={scoreInfo}
        />
      </div>
    </main>
  );
}
