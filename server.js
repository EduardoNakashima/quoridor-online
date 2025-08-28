// server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

const io = socketIo(server, {
    cors: {
        origin: "*", // Para produção, restrinja ao URL do seu site (ex: "https://meu-quoridor.onrender.com")
        methods: ["GET", "POST"]
    }
});

app.use(cors());
app.use(express.static('public'));

const rooms = {};

// =================================================================
// LÓGICA DO JOGO QUORIDOR (Centralizada no Servidor)
// =================================================================

function createInitialGameState() {
    return {
        players: [
            { id: 1, pawnPosition: { row: 0, col: 4 }, wallsLeft: 10, goalRow: 8 },
            { id: 2, pawnPosition: { row: 8, col: 4 }, wallsLeft: 10, goalRow: 0 }
        ],
        horizontalWalls: [],
        verticalWalls: [],
        currentPlayerIndex: 0,
        gameOver: false,
        winner: null
    };
}

function getValidPawnMoves(gameState, player, opponent) {
    const validMoves = [];
    const { row, col } = player.pawnPosition;
    const opponentPos = opponent.pawnPosition;
    const potentialMoves = [ { r: -1, c: 0 }, { r: 1, c: 0 }, { r: 0, c: -1 }, { r: 0, c: 1 } ];

    for (const move of potentialMoves) {
        const newRow = row + move.r;
        const newCol = col + move.c;

        if (newRow >= 0 && newRow <= 8 && newCol >= 0 && newCol <= 8) {
            if (isWallBetween(gameState, { row, col }, { row: newRow, col: newCol })) continue;
            
            if (newRow === opponentPos.row && newCol === opponentPos.col) {
                const jumpRow = opponentPos.row + move.r;
                const jumpCol = opponentPos.col + move.c;

                if (!isWallBetween(gameState, opponentPos, { row: jumpRow, col: jumpCol })) {
                     if (jumpRow >= 0 && jumpRow <= 8 && jumpCol >= 0 && jumpCol <= 8) {
                        validMoves.push({ row: jumpRow, col: jumpCol });
                     }
                }
            } else {
                validMoves.push({ row: newRow, col: newCol });
            }
        }
    }
    return validMoves;
}

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
    // 1. Verificações simples de sobreposição
    if (type === 'h') {
        if (gameState.horizontalWalls.some(w => w.row === row && w.col === col)) return false;
        if (gameState.verticalWalls.some(w => w.row === row && w.col === col)) return false;
        if (gameState.horizontalWalls.some(w => w.row === row && (w.col === col - 1 || w.col === col + 1))) return false;
    } else { // type === 'v'
        if (gameState.verticalWalls.some(w => w.row === row && w.col === col)) return false;
        if (gameState.horizontalWalls.some(w => w.row === row && w.col === col)) return false;
        if (gameState.verticalWalls.some(w => w.col === col && (w.row === row - 1 || w.row === row + 1))) return false;
    }

    // 2. Verificação de bloqueio de caminho (a lógica principal)
    const tempWall = { row, col };
    const wallArray = type === 'h' ? gameState.horizontalWalls : gameState.verticalWalls;
    
    // Simula a colocação da barreira
    wallArray.push(tempWall);

    const p1 = gameState.players[0];
    const p2 = gameState.players[1];

    // Roda o BFS para ambos os jogadores
    const p1HasPath = pathExists(gameState, p1.pawnPosition, p1.goalRow);
    const p2HasPath = pathExists(gameState, p2.pawnPosition, p2.goalRow);

    // Desfaz a simulação, removendo a barreira temporária
    wallArray.pop();

    // A jogada só é válida se AMBOS os jogadores ainda tiverem um caminho
    return p1HasPath && p2HasPath;
}

function checkForWin(player) {
    return player.pawnPosition.row === player.goalRow;
}

// =================================================================
// LÓGICA DE SALAS E SOCKET.IO
// =================================================================
io.on('connection', (socket) => {
    console.log(`Novo cliente conectado: ${socket.id}`);

    socket.on('createRoom', ({ roomName, password, playerName }) => {
        if (rooms[roomName]) {
            socket.emit('error', 'Esta sala já existe.'); return;
        }
        rooms[roomName] = {
            password,
            players: {},
            playerOrder: [],
            gameState: createInitialGameState()
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
        const opponent = room.gameState.players[(playerIndex + 1) % 2];
        const validMoves = getValidPawnMoves(room.gameState, currentPlayer, opponent);
        const isMoveValid = validMoves.some(m => m.row === move.row && m.col === move.col);

        if (isMoveValid) {
            currentPlayer.pawnPosition = move;
            if (checkForWin(currentPlayer)) {
                room.gameState.gameOver = true;
                room.gameState.winner = currentPlayer.id;
            } else {
                room.gameState.currentPlayerIndex = (room.gameState.currentPlayerIndex + 1) % 2;
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
            const wallData = { ...wall, playerId: currentPlayer.id };
            if (wall.type === 'h') {
                room.gameState.horizontalWalls.push(wallData);
            } else {
                room.gameState.verticalWalls.push(wallData);
            }
            currentPlayer.wallsLeft--;
            room.gameState.currentPlayerIndex = (room.gameState.currentPlayerIndex + 1) % 2;
            io.to(roomName).emit('gameStateUpdate', room.gameState);
        }
    });

    socket.on('disconnect', () => {
        console.log(`Cliente desconectado: ${socket.id}`);
        for (const roomName in rooms) {
            const room = rooms[roomName];
            if (room.players[socket.id]) {
                const disconnectedPlayerName = room.players[socket.id].playerName;
                delete room.players[socket.id];
                room.playerOrder = room.playerOrder.filter(id => id !== socket.id);
                
                io.to(roomName).emit('playerUpdate', { players: room.players, playerOrder: room.playerOrder });
                console.log(`${disconnectedPlayerName} saiu da sala ${roomName}`);

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
    if (Object.keys(room.players).length >= 2) { socket.emit('error', 'Esta sala está cheia.'); return; }

    socket.join(roomName);
    room.players[socket.id] = { playerName };
    room.playerOrder.push(socket.id);

    console.log(`${playerName} (${socket.id}) entrou na sala ${roomName}`);
    
    // Notifica todos na sala sobre a lista de jogadores atualizada
    io.to(roomName).emit('playerUpdate', { players: room.players, playerOrder: room.playerOrder });

    // Notifica o jogador que acabou de entrar que ele teve sucesso
    socket.emit('joinSuccess', { roomName });

    // Se a sala estiver cheia, inicia o jogo enviando o primeiro estado
    if (Object.keys(room.players).length === 2) {
        // Atribui os peões P1 e P2 com base na ordem de entrada
        room.gameState.players[0].playerName = room.players[room.playerOrder[0]].playerName;
        room.gameState.players[1].playerName = room.players[room.playerOrder[1]].playerName;
        io.to(roomName).emit('gameStateUpdate', room.gameState);
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));

// server.js -> ADICIONE ESTA NOVA FUNÇÃO

/**
 * Verifica se existe um caminho de uma posição inicial até uma linha de chegada usando BFS.
 * @param {object} gameState - O estado atual do jogo.
 * @param {object} startPos - A posição inicial { row, col }.
 * @param {number} goalRow - A linha de chegada do jogador.
 * @returns {boolean} - Retorna true se um caminho existe, false caso contrário.
 */
function pathExists(gameState, startPos, goalRow) {
    const queue = [startPos];
    const visited = Array(9).fill(null).map(() => Array(9).fill(false));
    visited[startPos.row][startPos.col] = true;

    while (queue.length > 0) {
        const currentPos = queue.shift(); // Pega o primeiro da fila

        // Se chegamos na linha de chegada, um caminho existe!
        if (currentPos.row === goalRow) {
            return true;
        }

        // Define os vizinhos possíveis (cima, baixo, esquerda, direita)
        const neighbors = [
            { row: currentPos.row - 1, col: currentPos.col },
            { row: currentPos.row + 1, col: currentPos.col },
            { row: currentPos.row, col: currentPos.col - 1 },
            { row: currentPos.row, col: currentPos.col + 1 },
        ];

        for (const neighbor of neighbors) {
            // Verifica se o vizinho é válido
            if (
                neighbor.row >= 0 && neighbor.row <= 8 &&
                neighbor.col >= 0 && neighbor.col <= 8 &&
                !visited[neighbor.row][neighbor.col] &&
                !isWallBetween(gameState, currentPos, neighbor)
            ) {
                visited[neighbor.row][neighbor.col] = true;
                queue.push(neighbor);
            }
        }
    }

    // Se a fila esvaziar e não chegamos ao objetivo, não há caminho.
    return false;
}