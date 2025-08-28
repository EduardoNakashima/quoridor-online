document.addEventListener('DOMContentLoaded', () => {
    const socket = io();

    // --- VARIÁVEIS DE ESTADO DO CLIENTE ---
    let gameState = {};
    let myPlayerId = null;
    let currentRoomName = '';

    // --- ELEMENTOS DO DOM ---
    const lobbyEl = document.getElementById('lobby');
    const createRoomForm = document.getElementById('create-room-form');
    const joinRoomForm = document.getElementById('join-room-form');
    const gameAreaEl = document.getElementById('game-area');
    const roomTitleEl = document.getElementById('room-title');
    const p1NameEl = document.getElementById('p1-name');
    const p2NameEl = document.getElementById('p2-name');
    const p1WallsEl = document.getElementById('p1-walls');
    const p2WallsEl = document.getElementById('p2-walls');
    const turnStatusEl = document.getElementById('turn-status').querySelector('p');
    const boardEl = document.getElementById('board');
    const boardContainerEl = document.getElementById('board-container');
    const restartButton = document.getElementById('restart-button');
    const victoryPopupEl = document.getElementById('victory-popup');
    const rulesBtn = document.getElementById('rules-btn');
    const rulesModal = document.getElementById('rules-modal');
    const modalCloseBtn = document.getElementById('modal-close-btn');

    // --- LÓGICA DO LOBBY ---
    createRoomForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const playerName = document.getElementById('create-player-name').value.trim();
        const roomName = document.getElementById('create-room-name').value.trim();
        const password = document.getElementById('create-room-password').value;
        if (playerName && roomName && password) {
            socket.emit('createRoom', { roomName, password, playerName });
            currentRoomName = roomName;
        }
    });

    joinRoomForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const playerName = document.getElementById('join-player-name').value.trim();
        const roomName = document.getElementById('join-room-name').value.trim();
        const password = document.getElementById('join-room-password').value;
        if (playerName && roomName && password) {
            socket.emit('joinRoom', { roomName, password, playerName });
            currentRoomName = roomName;
        }
    });

    restartButton.addEventListener('click', () => { window.location.reload(); });

    // Event Listeners para o Modal de Regras
    rulesBtn.addEventListener('click', () => {
        rulesModal.classList.remove('hidden');
    });

    modalCloseBtn.addEventListener('click', () => {
        rulesModal.classList.add('hidden');
    });
    
    rulesModal.addEventListener('click', (e) => {
        if (e.target === rulesModal) {
            rulesModal.classList.add('hidden');
        }
    });

    // --- SOCKET.IO LISTENERS ---
    socket.on('error', (message) => { alert(`Erro: ${message}`); });

    socket.on('joinSuccess', ({ roomName }) => {
        lobbyEl.classList.add('hidden');
        gameAreaEl.classList.remove('hidden');
        roomTitleEl.textContent = `Sala: ${roomName}`;
        window.addEventListener('resize', createBoard);
    });

    socket.on('playerUpdate', ({ players, playerOrder }) => {
        const myIndex = playerOrder.indexOf(socket.id);
        myPlayerId = myIndex + 1;
        const playerNames = playerOrder.map(id => players[id] ? players[id].playerName : '...');
        p1NameEl.textContent = playerNames[0] || 'Aguardando...';
        p2NameEl.textContent = playerNames[1] || 'Aguardando...';
    });
    
    socket.on('gameStateUpdate', (newGameState) => {
        gameState = newGameState;
        renderGame();
    });

    // --- RENDERIZAÇÃO E LÓGICA DE CLIQUE (CLIENTE) ---
    function renderGame() {
        if (!gameState.players) return;
        createBoard();
        const { players, currentPlayerIndex, gameOver, winner } = gameState;
        players.forEach((player, index) => {
            const { row, col } = player.pawnPosition;
            const cell = document.querySelector(`.cell[data-row='${row}'][data-col='${col}']`);
            const pawn = document.createElement('div');
            pawn.classList.add('pawn', `pawn${index + 1}`);
            if(cell) cell.appendChild(pawn);
        });
        gameState.horizontalWalls.forEach(wall => {
            const wallEl = document.querySelector(`.wall-space[data-type='h'][data-row='${wall.row}'][data-col='${wall.col}']`);
            if (wallEl) wallEl.classList.add('placed', `p${wall.playerId}-wall`);
        });
        gameState.verticalWalls.forEach(wall => {
            const wallEl = document.querySelector(`.wall-space[data-type='v'][data-row='${wall.row}'][data-col='${wall.col}']`);
            if (wallEl) wallEl.classList.add('placed', `p${wall.playerId}-wall`);
        });
        p1WallsEl.textContent = players[0].wallsLeft;
        p2WallsEl.textContent = players[1].wallsLeft;
        if (gameOver) {
            turnStatusEl.textContent = `Jogador ${winner} Venceu!`;
            if (winner === myPlayerId) {
                showVictoryPopup(winner);
            }
        } else {
            const isMyTurn = (currentPlayerIndex + 1) === myPlayerId;
            const currentPlayerPanel = document.getElementById(`player${currentPlayerIndex + 1}-info`);
            const otherPlayerPanel = document.getElementById(`player${((currentPlayerIndex + 1) % 2) + 1}-info`);

            turnStatusEl.textContent = isMyTurn ? "É a sua vez!" : `Aguardando ${players[currentPlayerIndex].playerName}...`;
            document.body.style.backgroundColor = isMyTurn ? '#f0fff0' : 'var(--color-bg)';
            if (currentPlayerPanel) currentPlayerPanel.style.transform = 'scale(1.05)';
            if (otherPlayerPanel) otherPlayerPanel.style.transform = 'scale(1)';
        }
    }

    function handleCellClick(e) {
        if (gameState.gameOver || !e.target.closest('.cell')) return;
        const cell = e.target.closest('.cell');
        const move = {
            row: parseInt(cell.dataset.row),
            col: parseInt(cell.dataset.col)
        };
        socket.emit('playerMove', { roomName: currentRoomName, move });
    }

    function handleWallClick(e) {
        if (gameState.gameOver) return;
        const wallSpace = e.target;
        const wall = {
            type: wallSpace.dataset.type,
            row: parseInt(wallSpace.dataset.row),
            col: parseInt(wallSpace.dataset.col)
        };
        socket.emit('placeWall', { roomName: currentRoomName, wall });
    }
    
    function createBoard() {
        boardEl.innerHTML = '';
        const containerWidth = boardContainerEl.clientWidth;
        const cellSize = containerWidth / 10.6;
        const wallGap = cellSize / 5;
        boardEl.style.padding = `${wallGap}px`;
        boardEl.style.gridTemplateColumns = `repeat(9, ${cellSize}px)`;
        boardEl.style.gridTemplateRows = `repeat(9, ${cellSize}px)`;
        boardEl.style.gap = `${wallGap}px`;
        for (let i = 0; i < 81; i++) {
            const cell = document.createElement('div');
            cell.classList.add('cell');
            cell.dataset.row = Math.floor(i / 9);
            cell.dataset.col = i % 9;
            boardEl.appendChild(cell);
        }
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const hWall = document.createElement('div');
                hWall.classList.add('wall-space');
                hWall.dataset.type = 'h'; hWall.dataset.row = row; hWall.dataset.col = col;
                hWall.style.width = `${2 * cellSize + wallGap}px`;
                hWall.style.height = `${wallGap}px`;
                hWall.style.top = `${(row + 1) * cellSize + (row + 1) * wallGap}px`;
                hWall.style.left = `${col * cellSize + (col + 1) * wallGap}px`;
                hWall.addEventListener('click', handleWallClick);
                boardEl.appendChild(hWall);
                const vWall = document.createElement('div');
                vWall.classList.add('wall-space');
                vWall.dataset.type = 'v'; vWall.dataset.row = row; vWall.dataset.col = col;
                vWall.style.width = `${wallGap}px`;
                vWall.style.height = `${2 * cellSize + wallGap}px`;
                vWall.style.top = `${row * cellSize + (row + 1) * wallGap}px`;
                vWall.style.left = `${(col + 1) * cellSize + (col + 1) * wallGap}px`;
                vWall.addEventListener('click', handleWallClick);
                boardEl.appendChild(vWall);
            }
        }
        boardEl.addEventListener('click', handleCellClick);
    }

    function showVictoryPopup(winnerId) {
        const victoryMessageEl = victoryPopupEl.querySelector('#victory-message');
        const winnerName = (winnerId === 1) ? p1NameEl.textContent : p2NameEl.textContent;
        victoryMessageEl.textContent = `Parabéns, ${winnerName} venceu!`;
        victoryPopupEl.classList.remove('hidden');
        setTimeout(() => {
            victoryPopupEl.classList.add('hidden');
        }, 5000);
    }
});