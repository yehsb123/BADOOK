'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import GoBoard, { BoardMode } from '@/components/GoBoard';
import GamePanel from '@/components/GamePanel';
import GameHistory from '@/components/GameHistory';
import GameReplay from '@/components/GameReplay';
import {
  GameState,
  Position,
  Stone,
  createGame,
  placeStone,
  pass,
  calculateScore,
  removeDeadStones,
  getGroupAt,
} from '@/lib/game-engine';
import {
  OmokState,
  createOmokGame,
  placeOmokStone,
  isValidOmokMove,
  getOmokAIMove,
} from '@/lib/omok-engine';
import { Difficulty, getAIMove, getAIMoveAsync } from '@/lib/ai-engine';
import { initKataGo, isKataGoReady, isKataGoLoading } from '@/lib/katago-bridge';
import { saveRecord } from '@/lib/history';
import { playPlaceSound, playCaptureSound, playPassSound, playGameEndSound, playTimerWarningSound } from '@/lib/sounds';
import { estimateTerritory } from '@/lib/territory';
import { saveGame, loadGame, clearSave, SavedGame } from '@/lib/autosave';

type AppMode = 'menu' | 'playing' | 'history' | 'replay' | 'dead-stone' | 'omok';

export default function Home() {
  // ── 공통 상태 ──
  const [mode, setMode] = useState<AppMode>('menu');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [boardSize, setBoardSize] = useState(9);
  const [playerColor, setPlayerColor] = useState<Stone>('black');
  const [isAIThinking, setIsAIThinking] = useState(false);
  const [lastMove, setLastMove] = useState<Position | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [confirmModeEnabled, setConfirmModeEnabled] = useState(false);
  const [gameType, setGameType] = useState<'baduk' | 'omok'>('baduk');
  const [kataGoStatus, setKataGoStatus] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle');
  const aiTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const savedRef = useRef(false);

  // ── 바둑 상태 ──
  const [gameState, setGameState] = useState<GameState>(createGame(9));
  const [scoreInfo, setScoreInfo] = useState<ReturnType<typeof calculateScore> | null>(null);
  const [stateHistory, setStateHistory] = useState<GameState[]>([]); // 무르기용
  const [previewPos, setPreviewPos] = useState<Position | null>(null); // 착수 확인용
  const [deadStones, setDeadStones] = useState<Set<string>>(new Set()); // 사석 처리용
  const [replayState, setReplayState] = useState<GameState | null>(null);
  const [hintPos, setHintPos] = useState<Position | null>(null);
  const [showTerritory, setShowTerritory] = useState(false);
  const [territoryMap, setTerritoryMap] = useState<('black' | 'white' | null)[][] | undefined>();
  const [lastPlacedAnim, setLastPlacedAnim] = useState<Position | null>(null);
  const [hasSavedGame, setHasSavedGame] = useState(false);

  // ── 타이머 상태 ──
  const [timerEnabled, setTimerEnabled] = useState(false);
  const [timerMinutes, setTimerMinutes] = useState(10);
  const [blackTime, setBlackTime] = useState(600);
  const [whiteTime, setWhiteTime] = useState(600);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // ── 오목 상태 ──
  const [omokState, setOmokState] = useState<OmokState>(createOmokGame(15));
  const [omokHistory, setOmokHistory] = useState<OmokState[]>([]);

  // ── 이어하기 체크 (최초 마운트) ──
  useEffect(() => {
    const saved = loadGame();
    if (saved && saved.moves.length > 0) {
      setHasSavedGame(true);
    }
  }, []);

  // ── 영역 실시간 업데이트 ──
  useEffect(() => {
    if (showTerritory && gameType === 'baduk' && !gameState.isGameOver) {
      setTerritoryMap(estimateTerritory(gameState.board, gameState.boardSize));
    } else {
      setTerritoryMap(undefined);
    }
  }, [showTerritory, gameState.board, gameState.boardSize, gameState.isGameOver, gameType]);

  // ── 자동 저장 (바둑 매 수마다) ──
  useEffect(() => {
    if (mode === 'playing' && gameType === 'baduk' && !gameState.isGameOver && gameState.moveHistory.length > 0) {
      saveGame({
        gameType: 'baduk',
        difficulty,
        playerColor: playerColor || 'black',
        boardSize: gameState.boardSize,
        moves: gameState.moveHistory
          .filter(m => m.position)
          .map(m => ({ row: m.position!.row, col: m.position!.col, player: m.player as string })),
        timestamp: Date.now(),
      });
    }
  }, [gameState.moveHistory.length, mode, gameType, gameState.isGameOver, difficulty, playerColor, gameState.moveHistory, gameState.boardSize]);

  // ── 타이머 로직 (플레이어 차례에만 진행) ──
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);

    if (!timerEnabled || mode !== 'playing' || gameState.isGameOver || gameType !== 'baduk') return;

    // AI 차례에는 타이머 정지
    const isPlayerTurn = gameState.currentPlayer === playerColor;
    if (!isPlayerTurn) return;

    timerRef.current = setInterval(() => {
      if (playerColor === 'black') {
        setBlackTime(t => {
          if (t <= 11 && t > 0 && soundEnabled) playTimerWarningSound();
          if (t <= 1) {
            setGameState(prev => ({ ...prev, isGameOver: true, consecutivePasses: 2 }));
            return 0;
          }
          return t - 1;
        });
      } else {
        setWhiteTime(t => {
          if (t <= 11 && t > 0 && soundEnabled) playTimerWarningSound();
          if (t <= 1) {
            setGameState(prev => ({ ...prev, isGameOver: true, consecutivePasses: 2 }));
            return 0;
          }
          return t - 1;
        });
      }
    }, 1000);

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [timerEnabled, mode, gameState.isGameOver, gameState.currentPlayer, gameType, soundEnabled, playerColor]);

  // ── 바둑 게임 종료 → 사석 처리 단계 ──
  useEffect(() => {
    if (gameType === 'baduk' && gameState.isGameOver && mode === 'playing' && !savedRef.current) {
      if (soundEnabled) playGameEndSound();
      setMode('dead-stone');
    }
  }, [gameState.isGameOver, mode, gameType, soundEnabled]);

  // ── 바둑 AI ──
  const doAIMove = useCallback(
    (state: GameState) => {
      if (state.isGameOver) return;
      setIsAIThinking(true);

      const baseDelay = difficulty === 'hard' ? 100 : difficulty === 'medium' ? 200 : 400;
      const delay = baseDelay + Math.floor(Math.random() * 300);

      aiTimeoutRef.current = setTimeout(async () => {
        // KataGo 사용 가능하면 async, 아니면 동기
        let aiPos: Position | null = null;
        try {
          aiPos = await getAIMoveAsync(state, difficulty);
        } catch {
          aiPos = getAIMove(state, difficulty);
        }

        if (aiPos) {
          const newState = placeStone(state, aiPos);
          if (newState) {
            const captured = state.currentPlayer === 'black'
              ? newState.capturedByBlack - state.capturedByBlack
              : newState.capturedByWhite - state.capturedByWhite;
            if (soundEnabled) {
              if (captured > 0) playCaptureSound(captured);
              else playPlaceSound();
            }
            setStateHistory(prev => [...prev, state]);
            setGameState(newState);
            setLastMove(aiPos);
            setLastPlacedAnim(aiPos);
          } else {
            if (soundEnabled) playPassSound();
            setGameState(pass(state));
          }
        } else {
          if (soundEnabled) playPassSound();
          setGameState(pass(state));
        }
        setIsAIThinking(false);
      }, delay);
    },
    [difficulty, soundEnabled]
  );

  useEffect(() => {
    if (
      gameType === 'baduk' && mode === 'playing' &&
      !gameState.isGameOver &&
      gameState.currentPlayer !== playerColor &&
      !isAIThinking
    ) {
      doAIMove(gameState);
    }
  }, [gameState, playerColor, isAIThinking, mode, doAIMove, gameType]);

  // ── 오목 AI ──
  useEffect(() => {
    if (
      gameType === 'omok' && mode === 'omok' &&
      !omokState.isGameOver &&
      omokState.currentPlayer !== playerColor &&
      !isAIThinking
    ) {
      setIsAIThinking(true);
      const baseDelay = difficulty === 'hard' ? 900 : difficulty === 'medium' ? 500 : 250;
      const delay = baseDelay + Math.floor(Math.random() * 500);

      aiTimeoutRef.current = setTimeout(() => {
        const aiPos = getOmokAIMove(omokState, difficulty);
        if (aiPos) {
          const newState = placeOmokStone(omokState, aiPos);
          if (newState) {
            if (soundEnabled) playPlaceSound();
            setOmokHistory(prev => [...prev, omokState]);
            setOmokState(newState);
            setLastMove(aiPos);
            if (newState.isGameOver) {
              if (soundEnabled) playGameEndSound();
            }
          }
        }
        setIsAIThinking(false);
      }, delay);
    }
  }, [omokState, playerColor, isAIThinking, mode, difficulty, gameType, soundEnabled]);

  // ── 오목 종료 시 기록 저장 ──
  const omokSavedRef = useRef(false);
  useEffect(() => {
    if (omokState.isGameOver && !omokSavedRef.current && gameType === 'omok') {
      omokSavedRef.current = true;
      const playerWon = omokState.winner === playerColor;
      const isDraw = omokState.winner === null;
      saveRecord({
        boardSize: omokState.boardSize,
        difficulty,
        playerColor: playerColor!,
        result: isDraw ? 'draw' : playerWon ? 'win' : 'lose',
        blackScore: 0,
        whiteScore: 0,
        moveCount: omokState.moveHistory.length,
      });
    }
  }, [omokState.isGameOver, omokState, playerColor, difficulty, gameType]);

  useEffect(() => {
    return () => { if (aiTimeoutRef.current) clearTimeout(aiTimeoutRef.current); };
  }, []);

  // ── 바둑 착수 (착수 확인 모드 지원) ──
  const handlePlaceStone = (pos: Position) => {
    if (isAIThinking || gameState.isGameOver) return;
    if (gameState.currentPlayer !== playerColor) return;

    if (confirmModeEnabled) {
      setPreviewPos(pos);
      return;
    }

    doPlaceStone(pos);
  };

  const doPlaceStone = (pos: Position) => {
    const newState = placeStone(gameState, pos);
    if (newState) {
      const captured = gameState.currentPlayer === 'black'
        ? newState.capturedByBlack - gameState.capturedByBlack
        : newState.capturedByWhite - gameState.capturedByWhite;
      if (soundEnabled) {
        if (captured > 0) playCaptureSound(captured);
        else playPlaceSound();
      }
      setStateHistory(prev => [...prev, gameState]);
      setGameState(newState);
      setLastMove(pos);
      setPreviewPos(null);
      setHintPos(null);
      setLastPlacedAnim(pos);
    }
  };

  const handleConfirmMove = () => {
    if (previewPos) doPlaceStone(previewPos);
  };

  const handleCancelMove = () => {
    setPreviewPos(null);
  };

  // ── 오목 착수 ──
  const handleOmokPlace = (pos: Position) => {
    if (isAIThinking || omokState.isGameOver) return;
    if (omokState.currentPlayer !== playerColor) return;
    if (!isValidOmokMove(omokState, pos)) return;

    if (confirmModeEnabled) {
      setPreviewPos(pos);
      return;
    }
    doPlaceOmokStone(pos);
  };

  const doPlaceOmokStone = (pos: Position) => {
    const newState = placeOmokStone(omokState, pos);
    if (newState) {
      if (soundEnabled) playPlaceSound();
      setOmokHistory(prev => [...prev, omokState]);
      setOmokState(newState);
      setLastMove(pos);
      setPreviewPos(null);
      if (newState.isGameOver && soundEnabled) playGameEndSound();
    }
  };

  const handleOmokConfirm = () => {
    if (previewPos) doPlaceOmokStone(previewPos);
  };

  // ── 무르기 ──
  const handleUndo = () => {
    if (gameType === 'baduk') {
      // 플레이어 + AI 2수 되돌리기
      if (stateHistory.length < 2) return;
      const prev = stateHistory[stateHistory.length - 2];
      setStateHistory(h => h.slice(0, -2));
      setGameState(prev);
      const lastMoveEntry = prev.moveHistory[prev.moveHistory.length - 1];
      setLastMove(lastMoveEntry?.position || null);
    } else {
      if (omokHistory.length < 2) return;
      const prev = omokHistory[omokHistory.length - 2];
      setOmokHistory(h => h.slice(0, -2));
      setOmokState(prev);
      const lastMoveEntry = prev.moveHistory[prev.moveHistory.length - 1];
      setLastMove(lastMoveEntry?.position || null);
    }
  };

  // ── 힌트 ──
  const handleHint = () => {
    if (gameType === 'baduk') {
      const hint = getAIMove(gameState, 'hard');
      setHintPos(hint);
      // 3초 후 힌트 숨기기
      setTimeout(() => setHintPos(null), 3000);
    } else {
      const hint = getOmokAIMove(omokState, 'hard');
      setHintPos(hint);
      setTimeout(() => setHintPos(null), 3000);
    }
  };

  // ── 이어하기 ──
  const handleContinueGame = () => {
    const saved = loadGame();
    if (!saved) return;

    setDifficulty(saved.difficulty as Difficulty);
    setPlayerColor(saved.playerColor as Stone);
    setBoardSize(saved.boardSize);
    setGameType(saved.gameType);

    if (saved.gameType === 'baduk') {
      let state = createGame(saved.boardSize);
      for (const move of saved.moves) {
        const next = placeStone(state, { row: move.row, col: move.col });
        if (next) state = next;
      }
      setGameState(state);
      setStateHistory([]);
      const last = saved.moves[saved.moves.length - 1];
      setLastMove(last ? { row: last.row, col: last.col } : null);
      setMode('playing');
    }

    savedRef.current = false;
    setHasSavedGame(false);
  };

  // ── 패스 ──
  const handlePass = () => {
    if (isAIThinking || gameState.isGameOver) return;
    if (soundEnabled) playPassSound();
    setStateHistory(prev => [...prev, gameState]);
    setGameState(pass(gameState));
    setLastMove(null);
  };

  // ── 기권 ──
  const handleResign = () => {
    if (gameType === 'baduk') {
      setGameState(prev => ({ ...prev, isGameOver: true, consecutivePasses: 2 }));
    } else {
      setOmokState(prev => ({ ...prev, isGameOver: true, winner: prev.currentPlayer === 'black' ? 'white' : 'black' }));
    }
  };

  // ── 사석 처리 ──
  const handleToggleDeadStone = (pos: Position) => {
    const stone = gameState.board[pos.row]?.[pos.col];
    if (!stone) return;

    const group = getGroupAt(gameState.board, pos);
    const newDead = new Set(deadStones);
    const key0 = `${group[0].row},${group[0].col}`;

    if (newDead.has(key0)) {
      // 해제
      group.forEach(p => newDead.delete(`${p.row},${p.col}`));
    } else {
      // 사석 마킹
      group.forEach(p => newDead.add(`${p.row},${p.col}`));
    }
    setDeadStones(newDead);
  };

  const handleConfirmDeadStones = () => {
    // 사석 제거 후 점수 계산
    const deadPositions = Array.from(deadStones).map(k => {
      const [r, c] = k.split(',').map(Number);
      return { row: r, col: c };
    });

    const cleaned = removeDeadStones(gameState, deadPositions);
    const score = calculateScore(cleaned);
    setScoreInfo(score);
    savedRef.current = true;

    const playerWon =
      (playerColor === 'black' && score.blackScore > score.whiteScore) ||
      (playerColor === 'white' && score.whiteScore > score.blackScore);
    const isDraw = score.blackScore === score.whiteScore;

    saveRecord({
      boardSize: gameState.boardSize,
      difficulty,
      playerColor: playerColor!,
      result: isDraw ? 'draw' : playerWon ? 'win' : 'lose',
      blackScore: score.blackScore,
      whiteScore: score.whiteScore,
      moveCount: gameState.moveHistory.length,
    });

    setMode('playing');
  };

  // ── 게임 시작 ──
  const startGame = (color: Stone) => {
    if (aiTimeoutRef.current) clearTimeout(aiTimeoutRef.current);
    setPlayerColor(color);
    setScoreInfo(null);
    setLastMove(null);
    setIsAIThinking(false);
    savedRef.current = false;
    omokSavedRef.current = false;
    setPreviewPos(null);
    setDeadStones(new Set());
    setStateHistory([]);
    setOmokHistory([]);
    setHintPos(null);
    setShowTerritory(false);
    setLastPlacedAnim(null);
    clearSave();
    setHasSavedGame(false);

    // KataGo 로딩 시작 (백그라운드)
    if (gameType === 'baduk' && kataGoStatus === 'idle') {
      setKataGoStatus('loading');
      initKataGo().then(ok => {
        setKataGoStatus(ok ? 'ready' : 'failed');
      }).catch(() => setKataGoStatus('failed'));
    }

    if (gameType === 'baduk') {
      setGameState(createGame(boardSize));
      if (timerEnabled) {
        setBlackTime(timerMinutes * 60);
        setWhiteTime(timerMinutes * 60);
      }
      setMode('playing');
    } else {
      setOmokState(createOmokGame(15));
      setMode('omok');
    }
  };

  const handleNewGame = () => {
    if (aiTimeoutRef.current) clearTimeout(aiTimeoutRef.current);
    setIsAIThinking(false);
    setMode('menu');
    setScoreInfo(null);
    setLastMove(null);
    setPreviewPos(null);
    setDeadStones(new Set());
  };

  const handleBoardSizeChange = (size: number) => {
    setBoardSize(size);
    if (mode === 'playing') {
      if (aiTimeoutRef.current) clearTimeout(aiTimeoutRef.current);
      setIsAIThinking(false);
      setGameState(createGame(size));
      setStateHistory([]);
      setScoreInfo(null);
      setLastMove(null);
    }
  };

  // ── 리플레이 ──
  const handleReplay = () => {
    setReplayState(gameState);
    setMode('replay');
  };

  // ── 타이머 포맷 ──
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // ────────────────────────
  // 렌더링
  // ────────────────────────

  if (mode === 'history') {
    return <GameHistory onClose={() => setMode('menu')} />;
  }

  if (mode === 'replay' && replayState) {
    return <GameReplay initialState={replayState} onClose={() => setMode(gameType === 'omok' ? 'omok' : 'playing')} />;
  }

  // ── 메인 메뉴 ──
  if (mode === 'menu') {
    return (
      <main className="min-h-dvh relative flex flex-col items-center justify-center px-4 py-8">
        {/* 배경 이미지 */}
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: 'url(/hero.png)' }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-black/80" />

        <div className="relative z-10 w-full max-w-sm space-y-5">
          {/* 로고 */}
          <div className="text-center space-y-2">
            <img src="/icon-512.png" alt="로고" className="w-20 h-20 mx-auto rounded-2xl shadow-2xl" />
            <h1 className="text-2xl font-black text-white tracking-tight drop-shadow-lg">성빈이와 바둑하기</h1>
            <p className="text-gray-300 text-sm drop-shadow">표준 규칙 기반 AI 대국</p>
          </div>

          {/* 게임 종류 */}
          <div className="space-y-2">
            <label className="text-gray-500 text-xs font-medium">게임 종류</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setGameType('baduk')}
                className={`py-3 rounded-xl transition-all active:scale-95 ${
                  gameType === 'baduk'
                    ? 'bg-amber-700 text-white shadow-lg shadow-amber-700/40'
                    : 'bg-gray-800/80 text-gray-400 hover:bg-gray-700/80'
                }`}
              >
                <div className="font-bold text-base">바둑</div>
                <div className="text-[10px] opacity-60">표준 규칙</div>
              </button>
              <button
                onClick={() => setGameType('omok')}
                className={`py-3 rounded-xl transition-all active:scale-95 ${
                  gameType === 'omok'
                    ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/40'
                    : 'bg-gray-800/80 text-gray-400 hover:bg-gray-700/80'
                }`}
              >
                <div className="font-bold text-base">오목</div>
                <div className="text-[10px] opacity-60">15x15</div>
              </button>
            </div>
          </div>

          {/* 바둑판 크기 (바둑만) */}
          {gameType === 'baduk' && (
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
          )}

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

          {/* 옵션 토글 */}
          <div className="space-y-2">
            <label className="text-gray-500 text-xs font-medium">옵션</label>
            <div className="space-y-2">
              <label className="flex items-center justify-between bg-gray-800/60 rounded-xl px-4 py-3 cursor-pointer">
                <span className="text-gray-300 text-sm">효과음</span>
                <input type="checkbox" checked={soundEnabled} onChange={e => setSoundEnabled(e.target.checked)}
                  className="w-5 h-5 rounded accent-blue-500" />
              </label>
              <label className="flex items-center justify-between bg-gray-800/60 rounded-xl px-4 py-3 cursor-pointer">
                <span className="text-gray-300 text-sm">착수 확인 (2단계)</span>
                <input type="checkbox" checked={confirmModeEnabled} onChange={e => setConfirmModeEnabled(e.target.checked)}
                  className="w-5 h-5 rounded accent-blue-500" />
              </label>
              {gameType === 'baduk' && (
                <label className="flex items-center justify-between bg-gray-800/60 rounded-xl px-4 py-3 cursor-pointer">
                  <div>
                    <span className="text-gray-300 text-sm">타이머</span>
                    {timerEnabled && (
                      <div className="flex items-center gap-2 mt-1">
                        {[5, 10, 20, 30].map(m => (
                          <button key={m} onClick={(e) => { e.preventDefault(); setTimerMinutes(m); }}
                            className={`text-[10px] px-2 py-0.5 rounded-full ${
                              timerMinutes === m ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400'
                            }`}>
                            {m}분
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <input type="checkbox" checked={timerEnabled} onChange={e => setTimerEnabled(e.target.checked)}
                    className="w-5 h-5 rounded accent-blue-500" />
                </label>
              )}
            </div>
          </div>

          {/* 이어하기 */}
          {hasSavedGame && (
            <button
              onClick={handleContinueGame}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600
                         text-white font-bold text-sm shadow-lg shadow-amber-600/30
                         active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              이어하기
            </button>
          )}

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
                <div className="w-10 h-10 mx-auto rounded-full bg-gradient-to-br from-gray-600 to-black shadow-lg mb-2" />
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
                <div className="w-10 h-10 mx-auto rounded-full bg-gradient-to-br from-white to-gray-300 shadow-lg mb-2" />
                <div className="text-white font-bold">백으로 시작</div>
                <div className="text-gray-500 text-[10px]">{gameType === 'baduk' ? '후수 (덤 6.5점)' : '후수'}</div>
              </button>
            </div>
          </div>

          {/* 대국 기록 */}
          <button
            onClick={() => setMode('history')}
            className="w-full mt-4 py-3 rounded-xl bg-gray-800/60 hover:bg-gray-700/60
                       border border-gray-700/30 transition-all active:scale-95
                       flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="text-gray-300 font-semibold text-sm">대국 기록</span>
          </button>
        </div>

        <footer className="relative z-10 mt-6 text-gray-400 text-[10px]">
          표준 바둑 규칙 (한국기원) 적용
        </footer>
      </main>
    );
  }

  // ── 사석 처리 화면 ──
  if (mode === 'dead-stone') {
    return (
      <main className="min-h-dvh bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950 flex flex-col items-center px-3 py-4">
        <div className="w-full max-w-[500px] space-y-3">
          <div className="text-center">
            <h2 className="text-white font-bold text-base">사석 처리</h2>
            <p className="text-gray-500 text-xs mt-1">죽은 돌(그룹)을 터치하여 제거하세요</p>
          </div>

          <GoBoard
            gameState={gameState}
            onPlaceStone={() => {}}
            onToggleDeadStone={handleToggleDeadStone}
            lastMove={lastMove}
            deadStones={deadStones}
            mode="dead-stone"
          />

          <div className="flex gap-2">
            <button
              onClick={() => setDeadStones(new Set())}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-gray-800 text-gray-300
                         hover:bg-gray-700 active:scale-95 transition-all"
            >
              초기화
            </button>
            <button
              onClick={handleConfirmDeadStones}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-blue-600 text-white
                         hover:bg-blue-500 active:scale-95 transition-all shadow-lg shadow-blue-600/30"
            >
              확인 (계가)
            </button>
          </div>
        </div>
      </main>
    );
  }

  // ── 오목 게임 화면 ──
  if (mode === 'omok') {
    const omokGameState: GameState = {
      board: omokState.board,
      boardSize: omokState.boardSize,
      currentPlayer: omokState.currentPlayer,
      capturedByBlack: 0,
      capturedByWhite: 0,
      previousBoard: null,
      moveHistory: omokState.moveHistory.map(m => ({ position: m.position, player: m.player })),
      consecutivePasses: 0,
      isGameOver: omokState.isGameOver,
      komi: 0,
    };

    return (
      <main className="min-h-dvh bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950 flex flex-col items-center px-3 py-4">
        <div className="w-full max-w-[500px] space-y-3">
          <div className="flex items-center justify-between">
            <button onClick={handleNewGame} className="text-gray-500 hover:text-gray-300 transition-colors text-sm flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              메뉴
            </button>
            <h1 className="text-white font-bold text-base">오목 15x15</h1>
            <div className="text-gray-600 text-xs">
              {difficulty === 'easy' ? '하' : difficulty === 'medium' ? '중' : '상'}
            </div>
          </div>

          <GoBoard
            gameState={omokGameState}
            onPlaceStone={handleOmokPlace}
            onConfirmMove={handleOmokConfirm}
            onCancelMove={handleCancelMove}
            lastMove={lastMove}
            previewPos={previewPos}
            mode="play"
            confirmMode={confirmModeEnabled}
            winLine={omokState.winLine}
          />

          {/* 오목 상태 */}
          <div className="flex items-center justify-between bg-gray-900 rounded-xl px-4 py-3">
            <div className="flex items-center gap-2">
              <div className={`w-5 h-5 rounded-full border-2 shadow-inner ${
                omokState.currentPlayer === 'black' ? 'bg-gray-900 border-gray-600' : 'bg-white border-gray-300'
              }`} />
              <span className="text-white font-medium text-sm">
                {omokState.isGameOver
                  ? omokState.winner ? `${omokState.winner === 'black' ? '흑' : '백'} 승!` : '무승부'
                  : isAIThinking ? 'AI 생각 중...' : omokState.currentPlayer === playerColor ? '당신의 차례' : 'AI 차례'}
              </span>
            </div>
            <span className="text-gray-500 text-xs">{omokState.moveHistory.length}수</span>
          </div>

          {omokState.isGameOver && omokState.winner && (
            <div className={`rounded-xl p-4 text-center ${
              omokState.winner === playerColor
                ? 'bg-blue-600/20 border border-blue-500/30'
                : 'bg-red-600/20 border border-red-500/30'
            }`}>
              <div className={`font-bold text-lg ${omokState.winner === playerColor ? 'text-blue-400' : 'text-red-400'}`}>
                {omokState.winner === playerColor ? '승리!' : '패배'}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={handleUndo}
              disabled={omokHistory.length < 2 || isAIThinking || omokState.isGameOver}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-gray-800 text-gray-300
                         hover:bg-gray-700 active:scale-95 transition-all
                         disabled:opacity-40 disabled:cursor-not-allowed">
              무르기
            </button>
            <button onClick={handleResign} disabled={omokState.isGameOver}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-red-900/40 text-red-400
                         hover:bg-red-900/60 active:scale-95 transition-all
                         disabled:opacity-40 disabled:cursor-not-allowed">
              기권
            </button>
            <button onClick={handleNewGame}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-blue-900/40 text-blue-400
                         hover:bg-blue-900/60 active:scale-95 transition-all">
              새 대국
            </button>
            {omokState.isGameOver && (
              <button
                onClick={() => { setReplayState(omokGameState); setMode('replay'); }}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-indigo-900/40 text-indigo-400
                           hover:bg-indigo-900/60 active:scale-95 transition-all">
                리플레이
              </button>
            )}
          </div>
        </div>
      </main>
    );
  }

  // ── 바둑 게임 화면 ──
  const isMyTurn = gameState.currentPlayer === playerColor && !gameState.isGameOver;

  return (
    <main className="min-h-dvh bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950 flex flex-col items-center px-3 py-4">
      <div className="w-full max-w-[500px] space-y-3">
        <div className="flex items-center justify-between">
          <button onClick={handleNewGame} className="text-gray-500 hover:text-gray-300 transition-colors text-sm flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            메뉴
          </button>
          <h1 className="text-white font-bold text-base">바둑 {boardSize}x{boardSize}</h1>
          <div className="text-xs">
            <span className="text-gray-600">
              {difficulty === 'easy' ? '하' : difficulty === 'medium' ? '중' : '상'}
            </span>
            {kataGoStatus === 'loading' && (
              <span className="text-blue-400 ml-1 animate-pulse">AI 로딩...</span>
            )}
            {kataGoStatus === 'ready' && (
              <span className="text-emerald-400 ml-1">KataGo</span>
            )}
            {kataGoStatus === 'failed' && (
              <span className="text-gray-500 ml-1">기본 AI</span>
            )}
          </div>
        </div>

        {/* 타이머 */}
        {timerEnabled && (
          <div className="grid grid-cols-2 gap-2">
            <div className={`rounded-xl px-3 py-2 text-center ${
              gameState.currentPlayer === 'black' ? 'bg-gray-800 ring-2 ring-blue-500/50' : 'bg-gray-900'
            }`}>
              <div className="text-gray-500 text-[10px]">흑 {playerColor === 'black' ? '(나)' : '(AI)'}</div>
              <div className={`font-mono font-bold text-lg ${blackTime <= 30 ? 'text-red-400' : 'text-white'}`}>
                {formatTime(blackTime)}
              </div>
            </div>
            <div className={`rounded-xl px-3 py-2 text-center ${
              gameState.currentPlayer === 'white' ? 'bg-gray-800 ring-2 ring-blue-500/50' : 'bg-gray-900'
            }`}>
              <div className="text-gray-500 text-[10px]">백 {playerColor === 'white' ? '(나)' : '(AI)'}</div>
              <div className={`font-mono font-bold text-lg ${whiteTime <= 30 ? 'text-red-400' : 'text-white'}`}>
                {formatTime(whiteTime)}
              </div>
            </div>
          </div>
        )}

        <GoBoard
          gameState={gameState}
          onPlaceStone={handlePlaceStone}
          onConfirmMove={handleConfirmMove}
          onCancelMove={handleCancelMove}
          lastMove={lastMove}
          previewPos={previewPos}
          mode="play"
          confirmMode={confirmModeEnabled}
          hintPos={hintPos}
          showTerritory={showTerritory}
          territoryMap={territoryMap}
          lastPlacedAnim={lastPlacedAnim}
        />

        <GamePanel
          gameState={gameState}
          difficulty={difficulty}
          onDifficultyChange={(d) => setDifficulty(d)}
          onPass={handlePass}
          onResign={handleResign}
          onNewGame={handleNewGame}
          onBoardSizeChange={handleBoardSizeChange}
          isAIThinking={isAIThinking}
          playerColor={playerColor}
          scoreInfo={scoreInfo}
        />

        {/* 무르기 + 힌트 + 리플레이 */}
        <div className="flex gap-2">
          <button
            onClick={handleUndo}
            disabled={stateHistory.length < 2 || isAIThinking || gameState.isGameOver}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-gray-800 text-gray-300
                       hover:bg-gray-700 active:scale-95 transition-all
                       disabled:opacity-40 disabled:cursor-not-allowed"
          >
            무르기
          </button>
          <button
            onClick={handleHint}
            disabled={isAIThinking || gameState.isGameOver || gameState.currentPlayer !== playerColor}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-blue-900/40 text-blue-400
                       hover:bg-blue-900/60 active:scale-95 transition-all
                       disabled:opacity-40 disabled:cursor-not-allowed"
          >
            힌트
          </button>
          {gameState.isGameOver && (
            <button
              onClick={handleReplay}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-indigo-900/40 text-indigo-400
                         hover:bg-indigo-900/60 active:scale-95 transition-all"
            >
              리플레이
            </button>
          )}
        </div>

        {/* 게임 내 도구 */}
        {!gameState.isGameOver && (
          <div className="flex gap-2">
            <button
              onClick={() => setShowTerritory(t => !t)}
              className={`flex-1 py-2 rounded-xl text-xs font-medium transition-all active:scale-95 ${
                showTerritory
                  ? 'bg-purple-600/30 text-purple-400 ring-1 ring-purple-500/30'
                  : 'bg-gray-800/50 text-gray-500 hover:bg-gray-700/50'
              }`}
            >
              {showTerritory ? '영역 숨기기' : '영역 보기'}
            </button>
            <button
              onClick={() => setSoundEnabled(s => !s)}
              className={`flex-1 py-2 rounded-xl text-xs font-medium transition-all active:scale-95 ${
                soundEnabled
                  ? 'bg-gray-800/50 text-gray-400'
                  : 'bg-gray-800/50 text-gray-600'
              }`}
            >
              {soundEnabled ? '소리 ON' : '소리 OFF'}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
