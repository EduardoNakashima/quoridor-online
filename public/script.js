document.addEventListener('DOMContentLoaded', () => {
    // Conecta-se ao servidor
    const socket = io();

    // --- VARIÁVEIS DE ESTADO DO CLIENTE ---
    let gameState = {};
    let myPlayerId = null;
    let currentRoomName = '';
    let selectedMode = null;

    // --- ELEMENTOS DO DOM ---
    const modeSelectionEl = document.getElementById('mode-selection');
    const lobbyEl = document.getElementById('lobby');
    const gameAreaEl = document.getElementById('game-area');

    const modeButtons = document.querySelectorAll('.mode-button');
    const lobbyTitleEl = document.getElementById('lobby-title');
    const createRoomForm = document.getElementById('create-room-form');
    const joinRoomForm = document.getElementById('join-room-form');
    const backButton = document.getElementById('back-to-mode-selection-btn');

    const roomTitleEl = document.getElementById('room-title');
    const p1NameEl = document.getElementById('p1-name');
    const p2NameEl = document.getElementById('p2-name');
    const p3NameEl = document.getElementById('p3-name');
    const p4NameEl = document.getElementById('p4-name');
    const p1WallsEl = document.getElementById('p1-walls');
    const p2WallsEl = document.getElementById('p2-walls');
    const p3WallsEl = document.getElementById('p3-walls');
    const p4WallsEl = document.getElementById('p4-walls');
    
    const turnStatusEl = document.getElementById('turn-status').querySelector('p');
    const boardEl = document.getElementById('board');
    const boardContainerEl = document.getElementById('board-container');
    const restartButton = document.getElementById('restart-button');

    const victoryPopupEl = document.getElementById('victory-popup');
    const victoryTitleEl = document.getElementById('victory-title');
    const victoryMessageEl = document.getElementById('victory-message');

    // --- LÓGICA DE UI INICIAL E LOBBY ---
    modeButtons.forEach(button => {
        button.addEventListener('click', () => {
            selectedMode = button.dataset.mode;
            lobbyTitleEl.textContent = `Modo ${selectedMode.replace('v', ' vs ')}`;
            
            modeSelectionEl.classList.add('hidden');
            lobbyEl.classList.remove('hidden');
        });
    });

    backButton.addEventListener('click', () => {
        lobbyEl.classList.add('hidden');
        modeSelectionEl.classList.remove('hidden');
    });

    createRoomForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const playerName = document.getElementById('create-player-name').value.trim();
        const roomName = document.getElementById('create-room-name').value.trim();
        const password = document.getElementById('create-room-password').value;
        if (playerName && roomName && password) {
            socket.emit('createRoom', { roomName, password, playerName, gameMode: selectedMode });
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

    restartButton.addEventListener('click', () => {
        window.location.reload();
    });

    // --- SOCKET.IO LISTENERS (Ouvindo o Servidor) ---
    socket.on('error', (message) => { alert(`Erro: ${message}`); });

    socket.on('joinSuccess', ({ roomName }) => {
        lobbyEl.classList.add('hidden');
        gameAreaEl.classList.remove('hidden');
        roomTitleEl.textContent = `Sala: ${roomName}`;
        window.addEventListener('resize', createBoard);
    });

    socket.on('playerUpdate', ({ players, playerOrder, gameMode }) => {
        updatePlayerList(players, playerOrder, gameMode);
        
        const myIndex = playerOrder.indexOf(socket.id);
        myPlayerId = myIndex + 1;
    });
    
    socket.on('gameStateUpdate', (newGameState) => {
        gameState = newGameState;
        renderGame();
    });

    // --- FUNÇÕES DE RENDERIZAÇÃO E UI ---
    function updatePlayerList(players, playerOrder, gameMode) {
        const playerNames = playerOrder.map(id => players[id] ? players[id].playerName : 'Aguardando...');
        
        document.getElementById('player3-info').classList.toggle('hidden', gameMode !== '2v2');
        document.getElementById('player4-info').classList.toggle('hidden', gameMode !== '2v2');

        p1NameEl.textContent = playerNames[0] || 'Aguardando...';
        p2NameEl.textContent = playerNames[1] || 'Aguardando...';
        if (gameMode === '2v2') {
            p3NameEl.textContent = playerNames[2] || 'Aguardando...';
            p4NameEl.textContent = playerNames[3] || 'Aguardando...';
        }
    }

    function renderGame() {
        if (!gameState.players) return;
        
        createBoard();
        
        const { players, currentPlayerIndex, gameOver, winner, mode } = gameState;
        
        players.forEach((player) => {
            const { row, col } = player.pawnPosition;
            const cell = document.querySelector(`.cell[data-row='${row}'][data-col='${col}']`);
            const pawn = document.createElement('div');
            pawn.classList.add('pawn', `pawn${player.id}`);
            if(cell) cell.appendChild(pawn);
        });
        
        gameState.horizontalWalls.forEach(wall => {
            const wallEl = document.querySelector(`.wall-space[data-type='h'][data-row='${wall.row}'][data-col='${wall.col}']`);
            if (wallEl) wallEl.classList.add('placed', `${wall.team}-wall`);
        });
        gameState.verticalWalls.forEach(wall => {
            const wallEl = document.querySelector(`.wall-space[data-type='v'][data-row='${wall.row}'][data-col='${wall.col}']`);
            if (wallEl) wallEl.classList.add('placed', `${wall.team}-wall`);
        });

        p1WallsEl.textContent = players[0].wallsLeft;
        p2WallsEl.textContent = players[1].wallsLeft;
        if(mode === '2v2') {
            if (players[2]) p3WallsEl.textContent = players[2].wallsLeft;
            if (players[3]) p4WallsEl.textContent = players[3].wallsLeft;
        }

        if (gameOver) {
            turnStatusEl.textContent = `Fim de Jogo!`;
            showVictoryPopup(winner);
        } else {
            const currentPlayer = players[currentPlayerIndex];
            const isMyTurn = (currentPlayerIndex + 1) === myPlayerId;
            turnStatusEl.textContent = isMyTurn ? "É a sua vez!" : `Aguardando ${currentPlayer.playerName}...`;
            
            document.querySelectorAll('.player-info').forEach(el => el.style.transform = 'scale(1)');
            const currentPlayerPanel = document.getElementById(`player${currentPlayerIndex + 1}-info`);
            if (currentPlayerPanel) currentPlayerPanel.style.transform = 'scale(1.05)';
        }
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
    
    function showVictoryPopup(winningTeam) {
        const teamName = winningTeam.charAt(0).toUpperCase() + winningTeam.slice(1);
        victoryTitleEl.textContent = `Vitória do Time ${teamName}!`;
        victoryMessageEl.textContent = `O Time ${teamName} alcançou o objetivo!`;
        victoryPopupEl.classList.remove('hidden');
        setTimeout(() => {
            victoryPopupEl.classList.add('hidden');
        }, 5000);
    }

    // --- EMISSORES DE EVENTOS (Enviando ações para o Servidor) ---
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
        if (gameState.gameOver || !e.target.classList.contains('wall-space')) return;
        const wallSpace = e.target;
        const wall = {
            type: wallSpace.dataset.type,
            row: parseInt(wallSpace.dataset.row),
            col: parseInt(wallSpace.dataset.col)
        };
        socket.emit('placeWall', { roomName: currentRoomName, wall });
    }
});