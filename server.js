// server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(cors());
app.use(express.static('public'));

const rooms = {};

// =================================================================
// LÓGICA DO JOGO QUORIDOR (Centralizada no Servidor)
// =================================================================

function createInitialGameState(mode) {
    const baseState = {
        mode: mode,
        horizontalWalls: [],
        verticalWalls: [],
        currentPlayerIndex: 0,
        gameOver: false,
        winner: null
    };

    if (mode === '2v2') {
        baseState.players = [
            { id: 1, team: 'red', pawnPosition: { row: 0, col: 2 }, wallsLeft: 5, goalRow: 8 },
            { id: 2, team: 'blue', pawnPosition: { row: 8, col: 2 }, wallsLeft: 5, goalRow: 0 },
            { id: 3, team: 'red', pawnPosition: { row: 0, col: 6 }, wallsLeft: 5, goalRow: 8 },
            { id: 4, team: 'blue', pawnPosition: { row: 8, col: 6 }, wallsLeft: 5, goalRow: 0 }
        ];
    } else { // 1v1
        baseState.players = [
            { id: 1, team: 'red', pawnPosition: { row: 0, col: 4 }, wallsLeft: 10, goalRow: 8 },
            { id: 2, team: 'blue', pawnPosition: { row: 8, col: 4 }, wallsLeft: 10, goalRow: 0 }
        ];
    }
    return baseState;
}

// #####################################################################
// ##               FUNÇÃO CORRIGIDA PARA O BUG DE PULO               ##
// #####################################################################
function getValidPawnMoves(gameState, player) {
    const allPlayers = gameState.players;
    const validMoves = [];
    const { row, col } = player.pawnPosition;
    const potentialMoves = [{ r: -1, c: 0 }, { r: 1, c: 0 }, { r: 0, c: -1 }, { r: 0, c: 1 }];

    for (const move of potentialMoves) {
        const newRow = row + move.r;
        const newCol = col + move.c;

        // 1. Verifica se está dentro do tabuleiro e se não há uma barreira direta
        if (newRow >= 0 && newRow <= 8 && newCol >= 0 && newCol <= 8 && !isWallBetween(gameState, { row, col }, { row: newRow, col: newCol })) {
            
            // 2. Verifica se a casa de destino está ocupada por algum outro peão
            const occupyingPawn = allPlayers.find(p => p.pawnPosition.row === newRow && p.pawnPosition.col === newCol);

            if (occupyingPawn) {
                // 3. Se estiver ocupada, calcula a posição do pulo
                const jumpRow = newRow + move.r;
                const jumpCol = newCol + move.c;

                // 4. Verifica se o pulo é válido (dentro do tabuleiro e sem barreira ATRÁS do oponente)
                if (jumpRow >= 0 && jumpRow <= 8 && jumpCol >= 0 && jumpCol <= 8 && !isWallBetween(gameState, { row: newRow, col: newCol }, { row: jumpRow, col: jumpCol })) {
                    validMoves.push({ row: jumpRow, col: jumpCol });
                }
                // (Aqui entraria a lógica mais complexa para pulos diagonais se o oponente estiver bloqueado)
            } else {
                // 5. Se a casa estiver livre, é um movimento normal válido
                validMoves.push({ row: newRow, col: newCol });
            }
        }
    }
    return validMoves;
}
// #####################################################################

function isWallBetween(gameState, pos1, pos2) {
    if (pos1.col === pos2.col) {
        const wallRow = Math.min(pos1.row, pos2.row);
        return gameState.horizontalWalls.some(wall => wall.row === wallRow && (wall.col === pos1.col || wall.col === pos1.col - 1));
    }
    if (pos1.row === pos2.row) {
        const wallCol = Math.min(pos1.col, pos2.col);
        return gameState.verticalWalls.some(wall => wall.col === wallCol && (wall.row === pos1.row || wall.row === pos1.row - 1));
    }
    return false;
}

function isValidWallPlacement(gameState, type, row, col) {
    if (type === 'h') {
        if (gameState.horizontalWalls.some(w => w.row === row && w.col === col)) return false;
        if (gameState.verticalWalls.some(w => w.row === row && w.col === col)) return false;
        if (gameState.horizontalWalls.some(w => w.row === row && (w.col === col - 1 || w.col === col + 1))) return false;
    } else {
        if (gameState.verticalWalls.some(w => w.row === row && w.col === col)) return false;
        if (gameState.horizontalWalls.some(w => w.row === row && w.col === col)) return false;
        if (gameState.verticalWalls.some(w => w.col === col && (w.row === row - 1 || w.row === row + 1))) return false;
    }
    
    const tempWall = { row, col };
    const wallArray = type === 'h' ? gameState.horizontalWalls : gameState.verticalWalls;
    wallArray.push(tempWall);

    let allPlayersHavePath = true;
    for (const player of gameState.players) {
        if (!pathExists(gameState, player.pawnPosition, player.goalRow)) {
            allPlayersHavePath = false;
            break;
        }
    }

    wallArray.pop();
    return allPlayersHavePath;
}

function pathExists(gameState, startPos, goalRow) {
    const queue = [startPos];
    const visited = Array(9).fill(null).map(() => Array(9).fill(false));
    if (startPos) {
      visited[startPos.row][startPos.col] = true;
    }
    while (queue.length > 0) {
        const currentPos = queue.shift();
        if (currentPos.row === goalRow) return true;
        const neighbors = [
            { row: currentPos.row - 1, col: currentPos.col }, { row: currentPos.row + 1, col: currentPos.col },
            { row: currentPos.row, col: currentPos.col - 1 }, { row: currentPos.row, col: currentPos.col + 1 },
        ];
        for (const neighbor of neighbors) {
            if (neighbor.row >= 0 && neighbor.row <= 8 && neighbor.col >= 0 && neighbor.col <= 8 && !visited[neighbor.row][neighbor.col] && !isWallBetween(gameState, currentPos, neighbor)) {
                visited[neighbor.row][neighbor.col] = true;
                queue.push(neighbor);
            }
        }
    }
    return false;
}

function checkForWin(player) {
    return player.pawnPosition.row === player.goalRow;
}

// =================================================================
// LÓGICA DE SALAS E SOCKET.IO
// =================================================================
io.on('connection', (socket) => {
    console.log(`Novo cliente conectado: ${socket.id}`);

    socket.on('createRoom', ({ roomName, password, playerName, gameMode }) => {
        if (rooms[roomName]) {
            socket.emit('error', 'Esta sala já existe.'); return;
        }
        rooms[roomName] = {
            password,
            players: {},
            playerOrder: [],
            gameMode: gameMode,
            maxPlayers: gameMode === '2v2' ? 4 : 2,
            gameState: createInitialGameState(gameMode)
        };
        socket.emit('roomCreated', roomName);
        joinRoom(socket, roomName, password, playerName);
    });

    socket.on('joinRoom', ({ roomName, password, playerName }) => {
        joinRoom(socket, roomName, password, playerName);
    });
    
    socket.on('playerMove', ({ roomName, move }) => {
        const room = rooms[roomName];
        if (!room || room.gameState.gameOver) return;
        const playerIndex = room.playerOrder.indexOf(socket.id);
        if (playerIndex !== room.gameState.currentPlayerIndex) return;

        const currentPlayer = room.gameState.players[playerIndex];
        const validMoves = getValidPawnMoves(room.gameState, currentPlayer);
        const isMoveValid = validMoves.some(m => m.row === move.row && m.col === move.col);

        if (isMoveValid) {
            currentPlayer.pawnPosition = move;
            if (checkForWin(currentPlayer)) {
                room.gameState.gameOver = true;
                room.gameState.winner = currentPlayer.team;
            } else {
                room.gameState.currentPlayerIndex = (room.gameState.currentPlayerIndex + 1) % room.maxPlayers;
            }
            io.to(roomName).emit('gameStateUpdate', room.gameState);
        }
    });

    socket.on('placeWall', ({ roomName, wall }) => {
        const room = rooms[roomName];
        if (!room || room.gameState.gameOver) return;
        const playerIndex = room.playerOrder.indexOf(socket.id);
        if (playerIndex !== room.gameState.currentPlayerIndex) return;

        const currentPlayer = room.gameState.players[playerIndex];
        if (currentPlayer.wallsLeft > 0 && isValidWallPlacement(room.gameState, wall.type, wall.row, wall.col)) {
            const wallData = { ...wall, team: currentPlayer.team };
            if (wall.type === 'h') room.gameState.horizontalWalls.push(wallData);
            else room.gameState.verticalWalls.push(wallData);
            currentPlayer.wallsLeft--;
            room.gameState.currentPlayerIndex = (room.gameState.currentPlayerIndex + 1) % room.maxPlayers;
            io.to(roomName).emit('gameStateUpdate', room.gameState);
        }
    });

    socket.on('disconnect', () => {
        console.log(`Cliente desconectado: ${socket.id}`);
        for (const roomName in rooms) {
            const room = rooms[roomName];
            if (room.players[socket.id]) {
                delete room.players[socket.id];
                room.playerOrder = room.playerOrder.filter(id => id !== socket.id);
                
                io.to(roomName).emit('playerUpdate', { players: room.players, playerOrder: room.playerOrder, gameMode: room.gameMode });

                if(Object.keys(room.players).length === 0){
                    delete rooms[roomName];
                    console.log(`Sala vazia removida: ${roomName}`);
                }
                break;
            }
        }
    });
});

function joinRoom(socket, roomName, password, playerName) {
    const room = rooms[roomName];
    if (!room) { socket.emit('error', 'Sala não encontrada.'); return; }
    if (room.password !== password) { socket.emit('error', 'Senha incorreta.'); return; }
    if (Object.keys(room.players).length >= room.maxPlayers) { socket.emit('error', 'Esta sala está cheia.'); return; }

    socket.join(roomName);
    room.players[socket.id] = { playerName };
    room.playerOrder.push(socket.id);

    console.log(`${playerName} (${socket.id}) entrou na sala ${roomName}`);
    
    io.to(roomName).emit('playerUpdate', { players: room.players, playerOrder: room.playerOrder, gameMode: room.gameMode });
    socket.emit('joinSuccess', { roomName });

    if (Object.keys(room.players).length === room.maxPlayers) {
        room.playerOrder.forEach((playerId, index) => {
            if(room.gameState.players[index]) {
                room.gameState.players[index].playerName = room.players[playerId].playerName;
            }
        });
        io.to(roomName).emit('gameStateUpdate', room.gameState);
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));