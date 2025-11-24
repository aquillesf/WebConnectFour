// Queue Management
let playerQueue = [];
const currentUser = "JoãoSilva";
const userAvatar = "1";

function initializeQueue() {
    const savedQueue = JSON.parse(localStorage.getItem("playerQueue") || "[]");

    if (savedQueue.length === 0) {
        playerQueue = [
            { name: "JoãoSilva", avatar: "1", status: "playing" },
            { name: "MariaSantos", avatar: "2", status: "waiting" },
            { name: "PedroLima", avatar: "3", status: "waiting" },
            { name: "AnaCarla", avatar: "4", status: "waiting" }
        ];
    } else {
        playerQueue = savedQueue;
    }

    updateQueueDisplay();
}

function updateQueueDisplay() {
    const queueList = document.getElementById("queue-list");
    const joinBtn = document.getElementById("join-queue-btn");

    if (!queueList) return;

    const isInQueue = playerQueue.some(p => p.name === currentUser);

    if (joinBtn) {
        joinBtn.textContent = isInQueue ? "Sair da Fila" : "Entrar na Fila";
    }

    queueList.innerHTML = playerQueue.map((player, index) => {
        const isPlaying = player.status === "playing";
        const playingClass = isPlaying ? "playing" : "";

        return `
            <li class="queue-item ${playingClass}">
                <span class="queue-position">${index + 1}</span>
                <div class="queue-avatar">
                    <img src="Profile Pictures/${player.avatar}.jpg" alt="Avatar">
                </div>
                <div class="queue-info">
                    <div class="queue-name">${player.name}</div>
                    <div class="queue-status ${isPlaying ? 'playing' : ''}">
                        ${isPlaying ? '🎮 Jogando agora' : '⏳ Aguardando'}
                    </div>
                </div>
            </li>
        `;
    }).join("");

    localStorage.setItem("playerQueue", JSON.stringify(playerQueue));
}

function moveQueueForward() {
    if (playerQueue.length > 0) {
        playerQueue.shift();
        if (playerQueue.length > 0) {
            playerQueue[0].status = "playing";
        }
        updateQueueDisplay();
    }
}

const joinQueueBtn = document.getElementById("join-queue-btn");
if (joinQueueBtn) {
    joinQueueBtn.onclick = function () {
        const isInQueue = playerQueue.some(p => p.name === currentUser);

        if (isInQueue) {
            playerQueue = playerQueue.filter(p => p.name !== currentUser);
        } else {
            playerQueue.push({
                name: currentUser,
                avatar: localStorage.getItem("selectedAvatar") || userAvatar,
                status: "waiting"
            });
        }

        updateQueueDisplay();
    };
}

// Original Connect 4 code
const startGame = document.getElementById("start-game");
const canvas = document.getElementById("game");
const display = canvas ? canvas.getContext("2d") : null;

let radios = document.getElementsByName("game-mode");
let gameMode = "";
let boardPosition = "";

function rect(x, y, width, height, color) {
    display.fillStyle = color;
    display.fillRect(x, y, width, height);
}

function circle(x, y, color) {
    display.beginPath();
    display.fillStyle = color;
    display.arc(x, y, 30, 0, 2 * Math.PI);
    display.fill();
}

function text(t, x, y) {
    display.fillStyle = "black";
    display.font = "20px Montserrat";
    display.fillText(t, x, y);
}

const winningArrays = [
    [0, 1, 2, 3], [41, 40, 39, 38], [7, 8, 9, 10], [34, 33, 32, 31], [14, 15, 16, 17], [27, 26, 25, 24],
    [21, 22, 23, 24], [20, 19, 18, 17], [28, 29, 30, 31], [13, 12, 11, 10], [35, 36, 37, 38], [6, 5, 4, 3],
    [0, 7, 14, 21], [41, 34, 27, 20], [1, 8, 15, 22], [40, 33, 26, 19], [2, 9, 16, 23], [39, 32, 25, 18],
    [3, 10, 17, 24], [38, 31, 24, 17], [4, 11, 18, 25], [37, 30, 23, 16], [5, 12, 19, 26], [36, 29, 22, 15],
    [6, 13, 20, 27], [35, 28, 21, 14], [0, 8, 16, 24], [41, 33, 25, 17], [7, 15, 23, 31], [34, 26, 18, 10],
    [14, 22, 30, 38], [27, 19, 11, 3], [35, 29, 23, 17], [6, 12, 18, 24], [28, 22, 16, 10], [13, 19, 25, 31],
    [21, 15, 9, 3], [20, 26, 32, 38], [36, 30, 24, 18], [5, 11, 17, 23], [37, 31, 25, 19], [4, 10, 16, 22],
    [2, 10, 18, 26], [39, 31, 23, 15], [1, 9, 17, 25], [40, 32, 24, 16], [9, 17, 25, 33], [8, 16, 24, 32],
    [11, 17, 23, 29], [12, 18, 24, 30], [1, 2, 3, 4], [5, 4, 3, 2], [8, 9, 10, 11], [12, 11, 10, 9],
    [15, 16, 17, 18], [19, 18, 17, 16], [22, 23, 24, 25], [26, 25, 24, 23], [29, 30, 31, 32], [33, 32, 31, 30],
    [36, 37, 38, 39], [40, 39, 38, 37], [7, 14, 21, 28], [8, 15, 22, 29], [9, 16, 23, 30], [10, 17, 24, 31],
    [11, 18, 25, 32], [12, 19, 26, 33], [13, 20, 27, 34]
];

function getId(id) {
    return { row: Math.floor(id / 7), col: id % 7 };
}

function positionToBoard(position) {
    let board = [
        [0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0]
    ];

    for (let i = 0; i < position.length; i++) {
        let columnMap = [];
        board.forEach((row) => {
            columnMap.push(row[parseInt(position[i])]);
        });

        let farthestDown = 0;
        for (let j = 0; j < columnMap.length; j++) {
            if (columnMap[j] == 0) {
                farthestDown++;
            }
        }

        if (farthestDown > 0) {
            board[farthestDown - 1][parseInt(position[i])] = (i % 2) + 1;
        }
    }
    return board;
}

function checkWin(position) {
    let board = positionToBoard(position);
    for (let i = 0; i < winningArrays.length; i++) {
        let vals = [];
        for (let j = 0; j < winningArrays[i].length; j++) {
            vals.push(getId(winningArrays[i][j]));
        }
        if (board[vals[0].row][vals[0].col] == board[vals[1].row][vals[1].col] &&
            board[vals[0].row][vals[0].col] == board[vals[2].row][vals[2].col] &&
            board[vals[0].row][vals[0].col] == board[vals[3].row][vals[3].col]) {
            if (board[vals[0].row][vals[0].col] != 0) {
                return true;
            }
        }
    }
    return false;
}

let colors = ["#ffffff", "#fc5b5b", "#effc5b"];
let backgroundColor = "rgb(93, 152, 255)";
let boardColor = "rgb(93, 152, 255)";

let uiLoaded = false;
let currentColumn = 0;
let tokenColor = colors[1];
let twoPlayerWon = false;
let aiGameWon = false;
let botGoing = false;

const boardThemes = {
    "Vermelho & Amarelo": ["#ffffff", "#fc5b5b", "#effc5b"],
    "Laranja & Verde": ["#ffffff", "#f59342", "#42f57e"],
    "Preto & Roxo": ["#ffffff", "#000000", "#b71cd6"],
};

let boardThemesBaseNames = [
    ["Amarelo", "Vermelho"],
    ["Verde", "Laranja"],
    ["Roxo", "Preto"],
];

let boardThemeIndex = 0;

function getCount(position) {
    let responseObject = { "0": 0, "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0 };
    for (let i = 0; i < position.length; i++) {
        responseObject[position[i]]++;
    }
    return responseObject;
}

function evaluateBoard(board) {
    let score = 0;

    for (let i = 0; i < winningArrays.length; i++) {
        let vals = [];
        for (let j = 0; j < winningArrays[i].length; j++) {
            vals.push(getId(winningArrays[i][j]));
        }

        let pieces = [];
        for (let k = 0; k < vals.length; k++) {
            pieces.push(board[vals[k].row][vals[k].col]);
        }

        score += evaluateSequence(pieces);
    }

    return score;
}

function evaluateSequence(pieces) {
    let score = 0;
    let humanPieces = 0;
    let botPieces = 0;
    let empty = 0;

    for (let piece of pieces) {
        if (piece == 1) humanPieces++;
        else if (piece == 2) botPieces++;
        else empty++;
    }

    if (botPieces == 4) score += 1000;
    else if (botPieces == 3 && empty == 1) score += 100;
    else if (botPieces == 2 && empty == 2) score += 10;
    else if (botPieces == 1 && empty == 3) score += 1;

    if (humanPieces == 4) score -= 1000;
    else if (humanPieces == 3 && empty == 1) score -= 100;
    else if (humanPieces == 2 && empty == 2) score -= 10;
    else if (humanPieces == 1 && empty == 3) score -= 1;

    return score;
}

function isValidMove(position, col) {
    let currentState = getCount(position);
    return parseInt(currentState[col]) < 6;
}

function makeMove(position, col) {
    return position + col.toString();
}

function minimax(position, depth, isMaximizing, alpha, beta) {
    let board = positionToBoard(position);

    if (checkWin(position) || depth === 0) {
        return evaluateBoard(board);
    }

    if (isMaximizing) {
        let maxEval = -Infinity;
        for (let col = 0; col < 7; col++) {
            if (isValidMove(position, col)) {
                let newPosition = makeMove(position, col);
                let eval = minimax(newPosition, depth - 1, false, alpha, beta);
                maxEval = Math.max(maxEval, eval);
                alpha = Math.max(alpha, eval);
                if (beta <= alpha) break;
            }
        }
        return maxEval;
    } else {
        let minEval = Infinity;
        for (let col = 0; col < 7; col++) {
            if (isValidMove(position, col)) {
                let newPosition = makeMove(position, col);
                let eval = minimax(newPosition, depth - 1, true, alpha, beta);
                minEval = Math.min(minEval, eval);
                beta = Math.min(beta, eval);
                if (beta <= alpha) break;
            }
        }
        return minEval;
    }
}

function getBestMove(position) {
    let bestMove = -1;
    let bestValue = -Infinity;

    for (let col = 0; col < 7; col++) {
        if (isValidMove(position, col)) {
            let newPosition = makeMove(position, col);
            let moveValue = minimax(newPosition, 4, false, -Infinity, Infinity);

            if (moveValue > bestValue) {
                bestValue = moveValue;
                bestMove = col;
            }
        }
    }

    return bestMove;
}

function randomNumber(min, max) {
    return Math.round(Math.random() * (max - min) + min);
}

if (startGame) {
    startGame.onclick = () => {
        const panel = document.getElementById("nav-bar");
        panel.style.display = "none";

        for (var i = 0; i < radios.length; i++) {
            if (radios[i].checked) {
                gameMode = radios[i].value;
                break;
            }
        }

        uiLoaded = true;
        drawBoard(boardPosition);

        const buttons = document.getElementsByTagName('button');
        for (let button of buttons) {
            button.className = "unsadden";
        }

        console.log(`Game mode -> ${gameMode}`);
    };
}

function drawBoard(position) {
    let board = positionToBoard(position);
    display.clearRect(0, 0, canvas.width, canvas.height);
    rect(0, 0, canvas.width, canvas.height, boardColor);
    rect(0, 0, canvas.width, 120, backgroundColor);

    for (let i = 0; i < board.length; i++) {
        for (let j = 0; j < board[i].length; j++) {
            circle(j * 90 + 80, i * 80 + 175, colors[board[i][j]]);
        }
    }

    circle(currentColumn * 90 + 80, 70, tokenColor);

    if (gameMode == "single") {
        let res = checkWin(position);
        aiGameWon = res;

        if ((res && position.length % 2 == 1)) {
            text("Você ganhou!", 10, 30);
        } else if (res && position.length % 2 == 0 || aiGameWon) {
            text("Você perdeu!", 10, 30);
        }

        if (botGoing == true && !aiGameWon) {
            text("Bot pensando...", 10, 30);
        } else if (botGoing == false && !aiGameWon) {
            text("Sua vez!", 10, 30);
        }
    }

    if (gameMode == "two-player") {
        let res = checkWin(position);
        twoPlayerWon = res;

        if ((res && position.length % 2 == 1)) {
            text(`${boardThemesBaseNames[boardThemeIndex][1]} ganhou!`, 10, 30);
            moveQueueForward();
        }
        if ((res && position.length % 2 == 0)) {
            text(`${boardThemesBaseNames[boardThemeIndex][0]} ganhou!`, 10, 30);
            moveQueueForward();
        }
        if (position.length % 2 == 1 && !res) {
            text(`Vez de ${boardThemesBaseNames[boardThemeIndex][0]}!`, 10, 30);
        }
        if (position.length % 2 == 0 && !res) {
            text(`Vez de ${boardThemesBaseNames[boardThemeIndex][1]}!`, 10, 30);
        }
    }
}

const resignBtn = document.getElementById("resign");
if (resignBtn) {
    resignBtn.onclick = function () {
        if (uiLoaded) {
            document.getElementById("resign-panel").style.display = "block";
        } else {
            console.log("User tried to interact with the UI before they went through the mode selection!");
        }
    };
}

const yesBtn = document.getElementById("yes");
if (yesBtn) {
    yesBtn.onclick = function () {
        if (gameMode == "single" && !aiGameWon) {
            aiGameWon = true;
            drawBoard(boardPosition);
        } else if (gameMode == "two-player" && !twoPlayerWon) {
            twoPlayerWon = true;
            drawBoard(boardPosition);
        }
        document.getElementById("resign-panel").style.display = "none";
    };
}

const noBtn = document.getElementById("no");
if (noBtn) {
    noBtn.onclick = function () {
        document.getElementById("resign-panel").style.display = "none";
    };
}

document.onkeyup = function (e) {
    if (uiLoaded) {
        if (e.keyCode == 37) {
            currentColumn--;
            if (currentColumn < 0) {
                currentColumn = 0;
            }
        } else if (e.keyCode == 39) {
            currentColumn++;
            if (currentColumn > 6) {
                currentColumn = 6;
            }
        } else if (e.keyCode == 32) {
            if (gameMode == "single" && !aiGameWon && !botGoing) {
                let currentState = getCount(boardPosition);
                if (parseInt(currentState[currentColumn]) < 6) {
                    boardPosition += currentColumn;
                    drawBoard(boardPosition);

                    if (checkWin(boardPosition)) {
                        aiGameWon = true;
                        drawBoard(boardPosition);
                        return;
                    }

                    botGoing = true;
                    let randomWaitTime = randomNumber(500, 1500);

                    setTimeout(() => {
                        let botMove = getBestMove(boardPosition);
                        if (botMove !== -1) {
                            boardPosition += botMove;
                        }
                        botGoing = false;
                        drawBoard(boardPosition);
                    }, randomWaitTime);

                } else {
                    console.log("Column is full!");
                    return;
                }
            } else if (gameMode == "two-player" && !twoPlayerWon) {
                let currentState = getCount(boardPosition);
                if (parseInt(currentState[currentColumn]) < 6) {
                    boardPosition += currentColumn;
                    tokenColor = colors[(boardPosition.length % 2) + 1];
                    drawBoard(boardPosition);
                } else {
                    console.log("Column is full!");
                    return;
                }
            }
        }
        drawBoard(boardPosition);
    }
};

const changeModeBtn = document.getElementById("change-mode");
if (changeModeBtn) {
    changeModeBtn.onclick = function () {
        if (uiLoaded) {
            window.location.reload();
        }
    };
}

const profileBtn = document.getElementById("profile-btn");
if (profileBtn) {
    profileBtn.onclick = function () {
        window.location.href = "profile.html";
    };
}

const themeChangeBtn = document.getElementById("theme-change");
if (themeChangeBtn) {
    themeChangeBtn.onclick = () => {
        if (uiLoaded) {
            let boardThemeList = Object.values(boardThemes);
            boardThemeIndex++;
            boardThemeIndex = boardThemeIndex % boardThemeList.length;
            colors = boardThemeList[boardThemeIndex];
            tokenColor = colors[(boardPosition.length % 2) + 1];
            console.log("Theme change!", boardThemeList[boardThemeIndex]);
            drawBoard(boardPosition);
        }
    };
}

const darkBtn = document.getElementById("dark-mode-btn");
let darkMode = localStorage.getItem("darkMode") === "true";

if (darkBtn) {
    if (darkMode) {
        document.body.classList.add("dark");
        darkBtn.textContent = "Modo Claro";
        if (canvas) {
            boardColor = "rgb(120, 180, 255)";
        }
    }

    darkBtn.onclick = function () {
        darkMode = !darkMode;
        document.body.classList.toggle("dark");
        localStorage.setItem("darkMode", darkMode);

        if (darkMode) {
            darkBtn.textContent = "Modo Claro";
            if (canvas) {
                boardColor = "rgb(120, 180, 255)";
                drawBoard(boardPosition);
            }
        } else {
            darkBtn.textContent = "Modo Escuro";
            if (canvas) {
                boardColor = "rgb(93, 152, 255)";
                drawBoard(boardPosition);
            }
        }
    };
}

const gotoGameBtn = document.getElementById("goto-game");
if (gotoGameBtn) {
    gotoGameBtn.onclick = () => {
        window.location.href = "index.html";
    };
}

const editBtn = document.getElementById("edit-btn");
const saveBtn = document.getElementById("save-btn");
const cancelBtn = document.getElementById("cancel-btn");

if (editBtn && saveBtn && cancelBtn) {
    const inputs = [
        document.getElementById("profile-age"),
        document.getElementById("profile-city"),
        document.getElementById("profile-state"),
        document.getElementById("profile-country")
    ];

    let originalValues = {};

    editBtn.onclick = function () {
        inputs.forEach(input => {
            originalValues[input.id] = input.value;
            input.disabled = false;
        });

        editBtn.style.display = "none";
        saveBtn.style.display = "block";
        cancelBtn.style.display = "block";
    };

    saveBtn.onclick = function () {
        inputs.forEach(input => {
            input.disabled = true;
        });

        editBtn.style.display = "block";
        saveBtn.style.display = "none";
        cancelBtn.style.display = "none";

        alert("Perfil atualizado com sucesso!");
    };

    cancelBtn.onclick = function () {
        inputs.forEach(input => {
            input.value = originalValues[input.id];
            input.disabled = true;
        });

        editBtn.style.display = "block";
        saveBtn.style.display = "none";
        cancelBtn.style.display = "none";
    };
}

const changeAvatarBtn = document.getElementById("change-avatar-btn");
const avatarSelector = document.getElementById("avatar-selector");
const closeAvatarSelector = document.getElementById("close-avatar-selector");
const avatarOptions = document.querySelectorAll(".avatar-option");
const avatarImg = document.getElementById("avatar-img");

let selectedAvatar = localStorage.getItem("selectedAvatar") || "1";

if (avatarImg) {
    avatarImg.src = `Profile Pictures/${selectedAvatar}.jpg`;
}

if (changeAvatarBtn && avatarSelector) {
    changeAvatarBtn.onclick = function () {
        avatarSelector.style.display = "block";
        avatarOptions.forEach(option => {
            if (option.dataset.avatar === selectedAvatar) {
                option.classList.add("selected");
            }
        });
    };
}

if (closeAvatarSelector) {
    closeAvatarSelector.onclick = function () {
        avatarSelector.style.display = "none";
    };
}

avatarOptions.forEach(option => {
    option.onclick = function () {
        avatarOptions.forEach(opt => opt.classList.remove("selected"));
        option.classList.add("selected");
        selectedAvatar = option.dataset.avatar;

        avatarImg.src = `Profile Pictures/${selectedAvatar}.jpg`;

        localStorage.setItem("selectedAvatar", selectedAvatar);

        setTimeout(() => {
            avatarSelector.style.display = "none";
        }, 300);
    };
});

function addPointsToPlayer(playerName, points) {
    let leaderboardData = JSON.parse(localStorage.getItem("leaderboard") || "[]");

    let player = leaderboardData.find(p => p.name === playerName);
    if (player) {
        player.points += points;
        player.wins += 1;
    } else {
        leaderboardData.push({
            name: playerName,
            points: points,
            wins: 1,
            avatar: localStorage.getItem("selectedAvatar") || "1"
        });
    }

    leaderboardData.sort((a, b) => b.points - a.points);
    localStorage.setItem("leaderboard", JSON.stringify(leaderboardData));
    updateLeaderboard();
}

function updateLeaderboard() {
    const leaderboardList = document.getElementById("leaderboard-list");
    if (!leaderboardList) return;

    let leaderboardData = JSON.parse(localStorage.getItem("leaderboard") || "[]");

    if (leaderboardData.length === 0) {
        leaderboardData = [
            { name: "JoãoSilva", points: 150, wins: 15, avatar: "1" },
            { name: "MariaSantos", points: 120, wins: 12, avatar: "2" },
            { name: "PedroLima", points: 100, wins: 10, avatar: "3" },
            { name: "AnaCarla", points: 80, wins: 8, avatar: "4" },
            { name: "CarlosReis", points: 60, wins: 6, avatar: "5" }
        ];
        localStorage.setItem("leaderboard", JSON.stringify(leaderboardData));
    }

    const rankClasses = ["gold", "silver", "bronze"];

    leaderboardList.innerHTML = leaderboardData.slice(0, 10).map((player, index) => {
        const rankClass = index < 3 ? rankClasses[index] : "";
        return `
            <li class="leaderboard-item">
                <span class="leaderboard-rank ${rankClass}">${index + 1}</span>
                <div class="leaderboard-avatar">
                    <img src="Profile Pictures/${player.avatar}.jpg" alt="Avatar" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">
                </div>
                <div class="leaderboard-info">
                    <div class="leaderboard-name">${player.name}</div>
                    <div class="leaderboard-score">${player.wins} vitórias</div>
                </div>
                <div class="leaderboard-points">${player.points}</div>
            </li>
        `;
    }).join("");
}

// Initialize
if (document.getElementById("leaderboard-list")) {
    updateLeaderboard();
}

if (document.getElementById("queue-list")) {
    initializeQueue();
}