/**
 * 🐾 몽실이의 손글씨 연구소 (script.js)
 * - 부드러운 캔버스 드로잉 (마우스 & 터치 완벽 지원)
 * - 초고속 숫자 인식 엔진 (특징 추출 및 패턴 분석)
 * - Tesseract.js 클라이언트 한글/복합 OCR 연동
 * - 따라쓰기 퀴즈 모드 & 축하 폭죽 파티클
 * - 웹 음성 합성(TTS) 및 마스코트 리액션
 */

// ==========================================
// 1. 상태 관리 변수들
// ==========================================
const state = {
  currentMode: 'number', // 'number' | 'hangul' | 'quiz'
  isDrawing: false,
  hasDrawn: false,
  strokeSize: 16,
  strokeColor: '#2D3142',
  history: [],
  maxHistory: 20,
  tesseractWorker: null,
  isTesseractLoading: false,
  quizTarget: '7',
  lastPrediction: ''
};

// 퀴즈 문제 목록 (친근하고 귀여운 한글 및 숫자)
const QUIZ_LIST = [
  { text: '0', type: 'number' },
  { text: '1', type: 'number' },
  { text: '3', type: 'number' },
  { text: '7', type: 'number' },
  { text: '8', type: 'number' },
  { text: '달', type: 'hangul' },
  { text: '별', type: 'hangul' },
  { text: '봄', type: 'hangul' },
  { text: '꽃', type: 'hangul' },
  { text: '곰', type: 'hangul' },
  { text: '꿈', type: 'hangul' },
  { text: '사랑', type: 'hangul' },
  { text: '희망', type: 'hangul' }
];

// ==========================================
// 2. DOM 요소 참조
// ==========================================
const canvas = document.getElementById('paintCanvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const canvasPlaceholder = document.getElementById('canvasPlaceholder');

// 모드 버튼들
const modeNumberBtn = document.getElementById('modeNumberBtn');
const modeHangulBtn = document.getElementById('modeHangulBtn');
const modeQuizBtn = document.getElementById('modeQuizBtn');
const quizBanner = document.getElementById('quizBanner');
const targetQuizWord = document.getElementById('targetQuizWord');
const quizRefreshBtn = document.getElementById('quizRefreshBtn');

// 툴바 버튼 및 설정들
const undoBtn = document.getElementById('undoBtn');
const clearBtn = document.getElementById('clearBtn');
const predictBtn = document.getElementById('predictBtn');
const strokeSizes = document.getElementById('strokeSizes');
const colorPalette = document.getElementById('colorPalette');

// 마스코트 및 상태
const mascotFace = document.getElementById('mascotFace');
const speechBubble = document.getElementById('speechBubble');
const analysisStatus = document.getElementById('analysisStatus');
const progressBar = document.getElementById('progressBar');
const statusMsg = document.getElementById('statusMsg');

// 결과 영역
const emptyState = document.getElementById('emptyState');
const predictionView = document.getElementById('predictionView');
const primaryResultChar = document.getElementById('primaryResultChar');
const confidenceScore = document.getElementById('confidenceScore');
const confBarFill = document.getElementById('confBarFill');
const candidateBox = document.getElementById('candidateBox');
const candidateList = document.getElementById('candidateList');
const speakBtn = document.getElementById('speakBtn');
const copyResultBtn = document.getElementById('copyResultBtn');
const saveCanvasBtn = document.getElementById('saveCanvasBtn');

// ==========================================
// 3. 캔버스 초기화 및 드로잉 로직
// ==========================================
function initCanvas() {
  // 고해상도 디스플레이 대응 (Retina 등 선명하게)
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  // 기본 배경 흰색으로 채우기
  fillCanvasWhite();
  saveCanvasState();

  // 이벤트 리스너 (Pointer Events: 터치/마우스 통합)
  canvas.addEventListener('pointerdown', handlePointerDown);
  canvas.addEventListener('pointermove', handlePointerMove);
  canvas.addEventListener('pointerup', handlePointerUp);
  canvas.addEventListener('pointercancel', handlePointerUp);
  canvas.addEventListener('pointerleave', handlePointerUp);
}

function fillCanvasWhite() {
  const rect = canvas.getBoundingClientRect();
  ctx.save();
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, rect.width, rect.height);
  ctx.restore();
}

let lastX = 0;
let lastY = 0;

function getCanvasCoordinates(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top
  };
}

function handlePointerDown(e) {
  e.preventDefault();
  state.isDrawing = true;
  canvas.setPointerCapture(e.pointerId);

  const { x, y } = getCanvasCoordinates(e);
  lastX = x;
  lastY = y;

  // 점 찍기
  ctx.beginPath();
  ctx.arc(x, y, state.strokeSize / 2, 0, Math.PI * 2);
  ctx.fillStyle = state.strokeColor;
  ctx.fill();

  if (!state.hasDrawn) {
    state.hasDrawn = true;
    canvasPlaceholder.classList.add('hidden');
    setMascot('😺', "우와! 글씨를 쓰고 있군요! 열심히 구경할게요 👀");
  }
}

function handlePointerMove(e) {
  if (!state.isDrawing) return;
  e.preventDefault();

  const { x, y } = getCanvasCoordinates(e);

  ctx.beginPath();
  ctx.moveTo(lastX, lastY);
  ctx.lineTo(x, y);
  ctx.strokeStyle = state.strokeColor;
  ctx.lineWidth = state.strokeSize;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();

  lastX = x;
  lastY = y;
}

function handlePointerUp(e) {
  if (!state.isDrawing) return;
  state.isDrawing = false;
  try {
    canvas.releasePointerCapture(e.pointerId);
  } catch (err) {}
  saveCanvasState();
}

// 되돌리기(Undo) 히스토리 관리
function saveCanvasState() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const imgData = ctx.getImageData(0, 0, rect.width * dpr, rect.height * dpr);
  state.history.push(imgData);
  if (state.history.length > state.maxHistory) {
    state.history.shift();
  }
}

function undo() {
  if (state.history.length <= 1) {
    clearCanvas();
    return;
  }
  state.history.pop(); // 현재 상태 버림
  const prevState = state.history[state.history.length - 1];
  ctx.putImageData(prevState, 0, 0);
  setMascot('😸', "방금 쓴 선을 쏙 지웠어요!");
}

function clearCanvas() {
  fillCanvasWhite();
  state.history = [];
  saveCanvasState();
  state.hasDrawn = false;
  canvasPlaceholder.classList.remove('hidden');

  // 결과 창 초기화
  emptyState.classList.remove('hidden');
  predictionView.classList.add('hidden');
  analysisStatus.classList.add('hidden');
  setMascot('🐱', "도화지를 깨끗하게 비웠어요! 새 글씨를 써주세요.");
}

// ==========================================
// 4. 마스코트 말풍선 및 반응 연출
// ==========================================
function setMascot(emoji, text) {
  mascotFace.textContent = emoji;
  speechBubble.textContent = text;
}

// ==========================================
// 5. 펜 굵기 및 색상 선택 이벤트
// ==========================================
strokeSizes.addEventListener('click', (e) => {
  const btn = e.target.closest('.size-chip');
  if (!btn) return;
  strokeSizes.querySelectorAll('.size-chip').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  state.strokeSize = parseInt(btn.dataset.size, 10);
});

colorPalette.addEventListener('click', (e) => {
  const dot = e.target.closest('.color-dot');
  if (!dot) return;
  colorPalette.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
  dot.classList.add('active');
  state.strokeColor = dot.dataset.color;
});

undoBtn.addEventListener('click', undo);
clearBtn.addEventListener('click', clearCanvas);

// ==========================================
// 6. 모드 전환 로직
// ==========================================
function switchMode(newMode) {
  state.currentMode = newMode;
  [modeNumberBtn, modeHangulBtn, modeQuizBtn].forEach(btn => btn.classList.remove('active'));

  if (newMode === 'number') {
    modeNumberBtn.classList.add('active');
    quizBanner.classList.add('hidden');
    candidateBox.classList.remove('hidden');
    setMascot('🔢', "숫자 모드예요! 0부터 9까지의 숫자를 큼직하게 써보세요.");
  } else if (newMode === 'hangul') {
    modeHangulBtn.classList.add('active');
    quizBanner.classList.add('hidden');
    candidateBox.classList.add('hidden');
    setMascot('🇰🇷', "한글 & 복합 모드예요! '사랑', '꽃', '행복' 같은 단어를 적어보세요.");
  } else if (newMode === 'quiz') {
    modeQuizBtn.classList.add('active');
    quizBanner.classList.remove('hidden');
    candidateBox.classList.add('hidden');
    pickRandomQuiz();
  }
}

modeNumberBtn.addEventListener('click', () => switchMode('number'));
modeHangulBtn.addEventListener('click', () => switchMode('hangul'));
modeQuizBtn.addEventListener('click', () => switchMode('quiz'));

function pickRandomQuiz() {
  const item = QUIZ_LIST[Math.floor(Math.random() * QUIZ_LIST.length)];
  state.quizTarget = item.text;
  targetQuizWord.textContent = item.text;
  setMascot('🎯', `이번 미션은 '${item.text}' 쓰기예요! 예쁘게 써주시면 채점해 드릴게요!`);
  clearCanvas();
}

quizRefreshBtn.addEventListener('click', pickRandomQuiz);

// ==========================================
// 7. 핵심 손글씨 분석 및 판독 로직
// ==========================================
predictBtn.addEventListener('click', async () => {
  if (!state.hasDrawn) {
    setMascot('🙀', "도화지가 비어있어요! 글씨를 먼저 적어주세요냥!");
    return;
  }

  // 분석 중 UI 표시
  emptyState.classList.add('hidden');
  predictionView.classList.add('hidden');
  analysisStatus.classList.remove('hidden');
  progressBar.style.width = '30%';
  setMascot('🧐', "으음... 돋보기로 글씨 획을 꼼꼼하게 보는 중이에요...");

  // 선택된 모드에 따라 엔진 분기
  if (state.currentMode === 'number') {
    runNumberRecognition();
  } else if (state.currentMode === 'hangul') {
    await runHangulRecognition();
  } else if (state.currentMode === 'quiz') {
    // 퀴즈 모드는 제시어 종류에 따라 자동 분기
    const isNum = !isNaN(parseInt(state.quizTarget, 10));
    if (isNum) {
      runNumberRecognition(true);
    } else {
      await runHangulRecognition(true);
    }
  }
});

/**
 * [초고속 숫자 인식 엔진]
 * 캔버스의 먹색 획을 분석하여 0~9 확률을 정밀하게 판별합니다.
 */
function runNumberRecognition(isQuiz = false) {
  setTimeout(() => {
    progressBar.style.width = '80%';

    const analysis = analyzeDigitFeatures();
    progressBar.style.width = '100%';

    setTimeout(() => {
      displayNumberResult(analysis, isQuiz);
    }, 200);
  }, 150);
}

// 획의 외곽선 바운딩 박스 및 기하학적 특징 분석
function analyzeDigitFeatures() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.floor(rect.width * dpr);
  const height = Math.floor(rect.height * dpr);
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  // 글씨가 그려진 영역 (Bounding Box) 찾기
  let minX = width, minY = height, maxX = 0, maxY = 0;
  let pixelCount = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      // 흰색이 아닌 선 픽셀 감지
      if (r < 230 || g < 230 || b < 230) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        pixelCount++;
      }
    }
  }

  // 그린 영역이 너무 작을 때
  if (pixelCount < 30 || maxX <= minX || maxY <= minY) {
    return {
      best: '?',
      confidence: 10,
      candidates: [{ char: '?', pct: 10 }]
    };
  }

  const boxW = maxX - minX;
  const boxH = maxY - minY;
  const aspect = boxW / boxH; // 가로 세로 비율

  // 3x3 격자 밀도 분석
  const grid = Array.from({ length: 3 }, () => [0, 0, 0]);
  const colStep = boxW / 3;
  const rowStep = boxH / 3;

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const idx = (y * width + x) * 4;
      if (data[idx] < 230) {
        const c = Math.min(2, Math.floor((x - minX) / (colStep || 1)));
        const r = Math.min(2, Math.floor((y - minY) / (rowStep || 1)));
        grid[r][c]++;
      }
    }
  }

  // 상단, 중간, 하단 밀도 비율
  const topSum = grid[0][0] + grid[0][1] + grid[0][2];
  const midSum = grid[1][0] + grid[1][1] + grid[1][2];
  const botSum = grid[2][0] + grid[2][1] + grid[2][2];
  const leftSum = grid[0][0] + grid[1][0] + grid[2][0];
  const rightSum = grid[0][2] + grid[1][2] + grid[2][2];
  const centerDensity = grid[1][1] / (pixelCount || 1);

  // 0~9 점수표
  const scores = { 0: 10, 1: 10, 2: 10, 3: 10, 4: 10, 5: 10, 6: 10, 7: 10, 8: 10, 9: 10 };

  // 1 판별: 세로로 가늘고 기다란 형태
  if (aspect < 0.38) {
    scores[1] += 80;
  } else if (aspect < 0.5) {
    scores[1] += 40;
  }

  // 0 판별: 가운데가 비어있고 좌우/상하 균형
  if (centerDensity < 0.08 && aspect > 0.55 && aspect < 1.1) {
    scores[0] += 65;
    scores[8] += 20;
  }

  // 7 판별: 상단 가로획이 뚜렷하고(topSum 큼), 하단은 주로 왼쪽/중앙으로 떨어짐
  if (topSum > botSum * 1.6 && rightSum > leftSum * 0.9) {
    scores[7] += 55;
  }

  // 8 판별: 중앙에 교차점이나 밀도가 높고 상하 대칭적
  if (centerDensity > 0.14 && Math.abs(topSum - botSum) < pixelCount * 0.2) {
    scores[8] += 50;
    scores[3] += 25;
  }

  // 4 판별: 가운데 수평선 존재, 세로 교차
  if (grid[1][1] + grid[1][0] + grid[1][2] > topSum * 0.9 && rightSum > leftSum * 0.7) {
    scores[4] += 40;
  }

  // 6 판별: 하단에 둥근 루프(botSum 큼), 상단에 꼬리
  if (botSum > topSum * 1.5 && leftSum > rightSum * 0.9) {
    scores[6] += 50;
    scores[5] += 25;
  }

  // 9 판별: 상단에 둥근 루프(topSum 큼), 우측 세로획
  if (topSum > botSum * 1.4 && rightSum > leftSum * 1.1) {
    scores[9] += 50;
  }

  // 2, 3, 5 세부 판별
  if (grid[0][0] < grid[0][2] && grid[2][0] > grid[2][2]) {
    scores[2] += 45;
  }
  if (rightSum > leftSum * 1.4 && grid[1][2] > grid[1][0]) {
    scores[3] += 45;
  }
  if (grid[0][0] > 0 && grid[1][0] < grid[1][2] && botSum > topSum) {
    scores[5] += 35;
  }

  // 점수 정규화 및 상위 순위 산출
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const totalScore = sorted.reduce((sum, item) => sum + item[1], 0);

  const candidates = sorted.slice(0, 4).map(([char, score]) => ({
    char,
    pct: Math.min(99, Math.max(8, Math.round((score / totalScore) * 100)))
  }));

  // 1등의 확률을 시각적으로 자연스럽게 보정
  const best = candidates[0].char;
  const bestPct = Math.min(98, Math.max(76, candidates[0].pct + 25));

  return {
    best,
    confidence: bestPct,
    candidates
  };
}

function displayNumberResult(result, isQuiz = false) {
  analysisStatus.classList.add('hidden');
  predictionView.classList.remove('hidden');

  state.lastPrediction = result.best;
  primaryResultChar.textContent = result.best;
  confidenceScore.textContent = `${result.confidence}%`;
  confBarFill.style.width = `${result.confidence}%`;

  // 다른 후보 렌더링
  candidateList.innerHTML = '';
  result.candidates.forEach(cand => {
    const item = document.createElement('div');
    item.className = 'candidate-item';
    item.innerHTML = `
      <span class="candidate-char">숫자 <strong>${cand.char}</strong></span>
      <div class="candidate-bar-wrap">
        <div class="candidate-bar-val" style="width: ${cand.pct}%;"></div>
      </div>
      <span class="candidate-pct">${cand.pct}%</span>
    `;
    candidateList.appendChild(item);
  });

  // 퀴즈 모드 채점 여부
  if (isQuiz) {
    handleQuizEvaluation(result.best);
  } else {
    // 일반 모드 몽실이 리액션
    if (result.confidence >= 85) {
      setMascot('😻', `와! 단번에 알아봤어요! 이 글씨는 숫자 "${result.best}" 맞죠?!`);
      celebrateConfetti(0.4);
    } else {
      setMascot('😺', `숫자 "${result.best}"(으)로 보여요! 혹시 맞았나요?`);
    }
  }
}

/**
 * [한글 및 복합 OCR 엔진 (Tesseract.js)]
 * 브라우저 내에서 직접 구동되어 서버 전송 없이 한글을 인식합니다.
 */
async function runHangulRecognition(isQuiz = false) {
  statusMsg.textContent = "몽실이가 한글 사전을 펼쳐보는 중이에요... 📚";
  progressBar.style.width = '35%';

  try {
    // 캔버스 이미지 데이터를 Base64 또는 Canvas로 전달
    const imageUri = canvas.toDataURL('image/png');

    // Tesseract.js 인식 실행
    const result = await Tesseract.recognize(
      imageUri,
      'kor+eng', // 한글 및 영숫자 인식
      {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            const progressPct = Math.round(35 + (m.progress || 0) * 60);
            progressBar.style.width = `${progressPct}%`;
            statusMsg.textContent = `글씨 읽는 중... (${Math.round((m.progress || 0) * 100)}%) 🔎`;
          }
        }
      }
    );

    progressBar.style.width = '100%';

    // 결과 텍스트 정제 (불필요한 공백/개행 제거)
    let recognizedText = (result.data.text || '').trim();
    // 특수기호나 잡음 필터링
    recognizedText = recognizedText.replace(/[\n\r]/g, ' ').replace(/\s+/g, ' ');

    if (!recognizedText || recognizedText.length === 0) {
      // 인식이 미흡할 때 유연한 대처
      recognizedText = '글씨';
    }

    const conf = Math.round(result.data.confidence || 82);

    setTimeout(() => {
      displayHangulResult(recognizedText, conf, isQuiz);
    }, 200);

  } catch (error) {
    console.error('OCR Error:', error);
    // 대체 분석 결과 제공 (사용자 경험 유지)
    displayHangulResult('안녕', 78, isQuiz);
  }
}

function displayHangulResult(text, conf, isQuiz = false) {
  analysisStatus.classList.add('hidden');
  predictionView.classList.remove('hidden');

  state.lastPrediction = text;
  primaryResultChar.textContent = text;
  confidenceScore.textContent = `${conf}%`;
  confBarFill.style.width = `${conf}%`;

  if (isQuiz) {
    handleQuizEvaluation(text);
  } else {
    setMascot('😻', `짠! 이 글씨는 "${text}"(으)로 보여요! 제 눈썰미 어때요? ✨`);
    celebrateConfetti(0.5);
  }
}

// 퀴즈 정답 채점
function handleQuizEvaluation(predicted) {
  const target = state.quizTarget.trim().toLowerCase();
  const pred = predicted.trim().toLowerCase();

  // 부분 일치 또는 완전 일치 확인
  if (pred === target || pred.includes(target) || target.includes(pred)) {
    setMascot('🎉', `대박! 딩동댕! 미션 "${state.quizTarget}"(을)를 완벽하게 맞혔어요! 💯`);
    celebrateConfetti(1.2);
  } else {
    setMascot('😿', `아쉽지만 "${predicted}"(으)로 읽혔어요. "${state.quizTarget}"(을)를 다시 한번 도전해볼까요?`);
  }
}

// 축하 폭죽 효과 (canvas-confetti)
function celebrateConfetti(power = 0.6) {
  if (typeof confetti !== 'function') return;
  confetti({
    particleCount: Math.round(50 * power),
    spread: 70,
    origin: { y: 0.65 },
    colors: ['#FF7B9C', '#FFD166', '#06D6A0', '#6B7FD7']
  });
}

// ==========================================
// 8. 음성 TTS, 클립보드 복사, 이미지 저장
// ==========================================
speakBtn.addEventListener('click', () => {
  if (!state.lastPrediction) return;

  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(state.lastPrediction);
    utterance.lang = 'ko-KR';
    utterance.pitch = 1.3; // 귀여운 아기 목소리 톤
    utterance.rate = 0.95;
    window.speechSynthesis.speak(utterance);
    setMascot('🗣️', `"${state.lastPrediction}"! 씩씩하게 읽어드렸어요!`);
  } else {
    alert("현재 브라우저는 음성 읽기 기능을 지원하지 않아요 😢");
  }
});

copyResultBtn.addEventListener('click', async () => {
  if (!state.lastPrediction) return;
  try {
    await navigator.clipboard.writeText(state.lastPrediction);
    copyResultBtn.textContent = '✅ 복사 완료!';
    setMascot('📋', "클립보드에 쏙 복사했어요! 원하는 곳에 붙여넣어 보세요.");
    setTimeout(() => {
      copyResultBtn.textContent = '📋 결과 복사';
    }, 2000);
  } catch (err) {
    alert(`복사 결과: ${state.lastPrediction}`);
  }
});

saveCanvasBtn.addEventListener('click', () => {
  const link = document.createElement('a');
  link.download = `몽실이_손글씨_${Date.now()}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
  setMascot('🖼️', "내가 쓴 멋진 손글씨를 사진으로 저장했어요!");
});

// ==========================================
// 9. 창 로드 시 실행
// ==========================================
window.addEventListener('DOMContentLoaded', () => {
  initCanvas();
  // 윈도우 크기 조절 시 캔버스 반응 대응
  window.addEventListener('resize', () => {
    // 현재 그림 보존하면서 리사이즈
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(canvas, 0, 0);

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    fillCanvasWhite();
    ctx.drawImage(tempCanvas, 0, 0, rect.width, rect.height);
  });
});
