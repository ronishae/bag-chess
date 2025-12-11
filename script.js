import { db } from "./firebase.js";
import { 
    doc, 
    getDoc, 
    setDoc, 
    updateDoc, 
    onSnapshot, 
    deleteDoc, 
    arrayUnion,
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

const SIZE = 8;

// do not change this; use for final implementation
const INIT = [
    ["r", "n", "b", "q", "k", "b", "n", "r"],
    ["f", "p", "p", "p", "p", "p", "p", "f"],
    [".", ".", ".", ".", ".", ".", ".", "."],
    [".", ".", ".", ".", ".", ".", ".", "."],
    [".", ".", ".", ".", ".", ".", ".", "."],
    [".", ".", ".", ".", ".", ".", ".", "."],
    ["F", "P", "P", "P", "P", "P", "P", "F"],
    ["R", "N", "B", "Q", "K", "B", "N", "R"],
];

// modify to anything for testing
const testBoard = [
    [".", ".", ".", ".", "k", ".", ".", "r"],
    [".", ".", ".", ".", ".", ".", ".", "."],
    [".", ".", ".", ".", "K", ".", ".", "."],
    [".", ".", ".", ".", ".", ".", ".", "."],
    [".", ".", ".", ".", ".", ".", ".", "."],
    [".", ".", ".", ".", ".", ".", ".", "."],
    [".", ".", ".", ".", ".", ".", ".", "."],
    [".", ".", ".", ".", ".", ".", ".", "R"],
];

// set this to INIT or testBoard as needed
var boardState = structuredClone(INIT);
const pieceList = ["p", "r", "n", "b", "q", "k"];
const MAPPING = {
    f: "flag",
    p: "pawn",
    r: "rook",
    n: "knight",
    b: "bishop",
    q: "queen",
    k: "king",
};
// TODO
// will need to be reset, will use new on them instead of adding in a loop... maybe should do that. can do that later
var blackBag = new Set([...pieceList]);
var whiteBag = new Set([...pieceList]);
var whiteTimer = null;
var blackTimer = null;
var waitingForWhiteFirstMove = true;
var waitingForBlackFirstMove = true;

var turn = "W"; // 'W' for White's turn, 'B' for Black
var zobristHash = 0n;
var zobristEnPassant = -1; // only one file can be a target, -1 for none
// maps zobrist hash to frequency of occurrence
var positionHistory = new Map(); 

// for implenetation of dragging pieces to move them
// is used in event.dataTransfer
// specific MIME format keys are stored in the browsers can be set and get from
// using event.dataTransfer.getData or setData
// we will just be using plain text
const DRAG_DATA_KEY = "text/plain"; 

// if a king moves, both sides not possible. If a rook moves, that respective side is not possible
// this just is whether it is theoretically possible.
// still need to check for:
// empty space
// not castling through check
// or into check
// or while in check
var blackQueenSidePossible = true;
var blackKingSidePossible = true;
var whiteQueenSidePossible = true;
var whiteKingSidePossible = true;

var lastClickedPieceLocation = null;
// [piece, endCoordinate]
var lastMove = {};

// CONVERTS: 2D Array (Game) -> Object (Database)
function packBoardForDB(boardArray) {
    const boardObj = {};
    boardArray.forEach((row, index) => {
        // We use the string "0", "1", "2" as keys
        boardObj[index.toString()] = row; 
    });
    return boardObj;
}

// CONVERTS: Object (Database) -> 2D Array (Game)
function unpackBoardFromDB(boardObj) {
    const boardArray = [];
    // We assume standard chess size of 8 rows
    for (let i = 0; i < 8; i++) {
        // If the row is missing (error case), return an empty row
        boardArray.push(boardObj[i.toString()] || Array(8).fill("."));
    }
    return boardArray;
}

var currentGameId = null;

// A helper to generate the starting state for the DB
function getInitialGameState() {
    return {
        created_at: Date.now(),

        board: packBoardForDB(INIT), 
        
        turn: "W",
        status: "waiting",
        winner: null,
        
        castling: {
            w_king: true, // whiteKingSidePossible
            w_queen: true, // whiteQueenSidePossible
            b_king: true,
            b_queen: true
        },

        bags: {
            white: ["p", "r", "n", "b", "q", "k"], // Array.from(whiteBag)
            black: ["p", "r", "n", "b", "q", "k"]
        },
        
        timers: {
            white: 600 * 1000,
            black: 600 * 1000,
            lastMoveTimestamp: null, // Needed to calculate elapsed time
            isWhite: true,
            isBlack: false,
            waitingForWhiteFirstMove: true,
            waitingForBlackFirstMove: true,
        },

        // 6. Zobrist & History
        // BigInt must be a string. Map must be an Object/JSON string.
        zobristHash: "0", 
        zobristEnPassant: -1,
        positionHistory: {}, // Object, not Map
        
        lastMove: null 
    };
}

function getCurrentGameStateForDB() {
    return {
        board: packBoardForDB(boardState),
        turn: turn,
        castling: {
            w_king: whiteKingSidePossible,
            w_queen: whiteQueenSidePossible,
            b_king: blackKingSidePossible,
            b_queen: blackQueenSidePossible
        },
        bags: {
            white: Array.from(whiteBag),
            black: Array.from(blackBag)
        },
        zobristHash: zobristHash.toString(),
        zobristEnPassant: zobristEnPassant,
        
        positionHistory: Object.fromEntries(positionHistory), 
        lastMove: lastMove,
        timers: {
            white: whiteTimer.remainingTimeInMs, 
            black: blackTimer.remainingTimeInMs,
            lastMoveTimestamp: Date.now(),
            isWhite: turn == "W",
            isBlack: turn == "B",
            waitingForWhiteFirstMove: waitingForWhiteFirstMove,
            waitingForBlackFirstMove: waitingForBlackFirstMove
        }
    };
}

function generateRandomId(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

async function checkAuth() {
    const auth = getAuth();
    if (!auth.currentUser) {
        console.log("Signing in anonymously...");
        await signInAnonymously(auth);
    }
}

const joinBtn = document.getElementById("join-game-button");
const codeInput = document.getElementById("game-code-input");

async function createRoom() {
    await checkAuth();
    
    let isUnique = false;
    let gameId = "";
    let attempts = 0;

    // give 10 tries for a unique room code
    // later can make it better
    while (!isUnique && attempts < 10) {
        gameId = generateRandomId(4);
        currentGameId = gameId;
        attempts++;

        const gameRef = doc(db, 'games', gameId);

        const snapshot = await getDoc(gameRef);
        const initialState = getInitialGameState();
        if (!snapshot.exists()) {
            isUnique = true;
            await setDoc(doc(db, "games", gameId), initialState);
            codeInput.value = gameId;
            syncUIDB(initialState); 
            console.log(`Success! Created room: ${gameId}`);
        }
    
        setupGameListener();
    }
    
    if (!isUnique) console.error("Could not find a unique ID after 10 tries.");
    
    return gameId;
}

document.getElementById("create-game-button").addEventListener("click", async () => {
    const gameId = await createRoom();
    alert(`Game created! Your game code is: ${gameId}`);
});



function setLocalVariables(roomData) {
    if (!roomData) {
        console.error("No room data provided to setLocalVariables");
        return;
    }

    // 1. Board: Unpack the object back into a 2D array
    if (roomData.board) {
        boardState = unpackBoardFromDB(roomData.board);
    }

    // 2. Simple Primitive Types (Strings, Numbers, Booleans)
    if (roomData.turn) turn = roomData.turn;
    
    // 3. Castling Rights (Map the object back to your individual variables)
    if (roomData.castling) {
        whiteKingSidePossible = roomData.castling.w_king;
        whiteQueenSidePossible = roomData.castling.w_queen;
        blackKingSidePossible = roomData.castling.b_king;
        blackQueenSidePossible = roomData.castling.b_queen;
    }

    // 4. Bags: Convert Arrays back to Sets
    // Firestore stores them as ["p", "r"], but your logic needs new Set(["p", "r"])
    if (roomData.bags) {
        whiteBag = new Set(roomData.bags.white || []);
        blackBag = new Set(roomData.bags.black || []);
    }

    // 5. Zobrist Hash: Convert String back to BigInt
    // JSON cannot store BigInts (e.g., 1234n), so we stored them as strings "1234"
    if (roomData.zobristHash) {
        zobristHash = BigInt(roomData.zobristHash);
    }

    if (roomData.zobristEnPassant !== undefined) {
        zobristEnPassant = roomData.zobristEnPassant;
    }

    // 6. Position History: Convert Object back to Map
    // Firestore stored it as { "1234": 1 }, logic needs Map { 1234n => 1 }
    if (roomData.positionHistory) {
        positionHistory = new Map();
        for (const [hashStr, count] of Object.entries(roomData.positionHistory)) {
            // We must convert the key string back to BigInt to match your hash logic
            positionHistory.set(BigInt(hashStr), count);
        }
    }

    // 7. Last Move
    if (roomData.lastMove) {
        lastMove = roomData.lastMove;
    } 

    if (roomData.timers) {
        const now = Date.now();
        waitingForWhiteFirstMove = roomData.timers.waitingForWhiteFirstMove;
        waitingForBlackFirstMove = roomData.timers.waitingForBlackFirstMove;
        let serverWhiteTime = roomData.timers.white;
        let serverBlackTime = roomData.timers.black;
        const lastTimestamp = roomData.timers.lastMoveTimestamp;

        // ONLY calculate elapsed time if the game has actually started
        // (i.e., we are not waiting for the very first move)
        if (lastTimestamp && !roomData.timers.waitingForWhiteFirstMove) {
            
            const elapsedMs = now - lastTimestamp;
            // Deduct elapsed time from whoever's turn it is RIGHT NOW
            if (roomData.turn === "W") {
                serverWhiteTime -= elapsedMs;
            } else {
                serverBlackTime -= elapsedMs;
            }
        }

        whiteTimer.setTime(serverWhiteTime);
        blackTimer.setTime(serverBlackTime);
        // stop to ensure if this is called on create game, any current timers are stopped
        whiteTimer.stop();
        blackTimer.stop();
        whiteTimer.updateDisplay();
        blackTimer.updateDisplay();
        if (roomData.turn === "W" && !waitingForWhiteFirstMove) {
            whiteTimer.start();
            blackTimer.stop();
        } else if (roomData.turn === "B" && !waitingForBlackFirstMove) {
            whiteTimer.stop();
            blackTimer.start();
        }
    }
    
    console.log("Local variables synced with DB!");
}


// TODO: might need ome extra logic to unsubscribe, not sure
function setupGameListener() {
    if (!currentGameId) {
        console.error("No game ID found to listen to.");
        return;
    }

    console.log(`Listening for updates on room: ${currentGameId}...`);
    const gameRef = doc(db, "games", currentGameId);

    onSnapshot(gameRef, (docSnap) => {
        if (docSnap.exists()) {
            const roomData = docSnap.data();
            
            console.log("Database update received!");
            syncUIDB(roomData);
        } else {
            console.log("Game room deleted or does not exist.");
            // Handle game over / room closed logic here
        }
    });
}

function syncUIDB (roomData) {
    setLocalVariables(roomData);
    clearIndicators();
    renderBoard(boardState);
    if (roomData.turn === "W") {
        var bagToHighlight = document.getElementById("white-bag");
        var bagToUnhighlight = document.getElementById("black-bag");
    } else {
        var bagToHighlight = document.getElementById("black-bag");
        var bagToUnhighlight = document.getElementById("white-bag");
    }
    bagToHighlight.classList.add("green-background");
    bagToUnhighlight.classList.remove("green-background");
    renderBags();
}

joinBtn.addEventListener("click", async () => {
    await checkAuth();
    const enteredCode = codeInput.value.trim().toUpperCase();
    console.log(enteredCode);
    if (!enteredCode) {
        alert("Please enter a game code!");
        return;
    }

    console.log(`Attempting to join room: ${enteredCode}...`);

    try {
        const roomRef = doc(db, "games", enteredCode);

        const roomSnap = await getDoc(roomRef);

        if (roomSnap.exists()) {
            currentGameId = enteredCode;
            
            const roomData = roomSnap.data();

            setupGameListener();
            syncUIDB(roomData);
            whiteTimer.stop();
            blackTimer.stop();

            alert(`Joined Room ${currentGameId}!`);
        } else {
            currentGameId = null;
            console.log("Room not found.");
            alert("Room not found. Please check the code.");
        }

    } catch (error) {
        console.error("Error joining room:", error);
        currentGameId = null;
    }
});








const board = document.getElementById("board");
function toLetter(num) {
    return String.fromCharCode("a".charCodeAt(0) + num);
}

function toCoordinate(row, col) {
    return toLetter(col) + (SIZE - row);
}

function fromCoordinate(coord) {
    const col = coord.charCodeAt(0) - "a".charCodeAt(0);
    const row = SIZE - parseInt(coord[1]);
    return [row, col];
}

function pieceFromCoordinate(coord) {
    const [row, col] = fromCoordinate(coord);
    return boardState[row][col];
}

function removeElementsByClass(className) {
    // 1. Select all matching elements
    const elements = document.querySelectorAll(`.${className}`);

    // 2. Iterate and remove each element
    // Note: The NodeList returned by querySelectorAll is static, so removing elements
    // while iterating is safe.
    elements.forEach((element) => {
        element.remove();
    });
}

function isInBounds(row, col) {
    return row >= 0 && row < SIZE && col >= 0 && col < SIZE;
}

function isEmptySquare(board, row, col) {
    return board[row][col] === ".";
}

function isBlackPiece(pieceType) {
    return pieceType === pieceType.toLowerCase() && pieceType !== ".";
}

function pawnOnStartingRow(row, pieceType) {
    if (!isBlackPiece(pieceType) && row === 6) return true;
    if (isBlackPiece(pieceType) && row === 1) return true;
    return false;
}

function isSameColour(first, second) {
    if (first === "." || second === ".") return false;
    return isBlackPiece(first) === isBlackPiece(second);
}

// can't simply negate isSameColour due to empty squares
function isOppositeColour(first, second) {
    if (first === "." || second === ".") return false;
    return isBlackPiece(first) !== isBlackPiece(second);
}

// converts array of [row, col] to string of coordinates
function convertMoves(moves) {
    if (!moves) return [];
    return moves.map(([r, c]) => toCoordinate(r, c));
}

// Function to generate a random 64-bit BigInt
function generateRandomBigInt() {
    // Generate four 16-bit numbers and combine them
    const p1 = BigInt(Math.floor(Math.random() * 65536));
    const p2 = BigInt(Math.floor(Math.random() * 65536));
    const p3 = BigInt(Math.floor(Math.random() * 65536));
    const p4 = BigInt(Math.floor(Math.random() * 65536));

    // Combine them into a single 64-bit number using bitwise shifts and OR
    // appending 'n' to a number is the way to denote BigInt literals in JS
    return (p4 << 48n) | (p3 << 32n) | (p2 << 16n) | p1;
}


const NUM_PIECE_TYPE = 14; // p, r, n, b, q, k, f for both colours
const NUM_BAG_PIECES = 12;
const NUM_SQUARES = 64;

function initializeZobristKeys() {
    const keys = {
        // Piece keys are now accessed by character and [row][col] index.
        // Piece characters: P, N, B, R, Q, K, F (White) and p, n, b, r, q, k, f (Black)
        pieces: {},

        // Side to move (only one key for 'b' to toggle from 'w')
        side: generateRandomBigInt(),

        // Castling rights (4 keys for KQkq)
        castling: {
            'K': generateRandomBigInt(), // White Kingside
            'Q': generateRandomBigInt(), // White Queenside
            'k': generateRandomBigInt(), // Black Kingside
            'q': generateRandomBigInt(), // Black Queenside
        },

        // En Passant target files (8 keys for files a-h, or 0-7)
        enPassant: Array(8).fill(0).map(() => generateRandomBigInt()),
        bag: {},
    };

    const pieceChars = ['P', 'N', 'B', 'R', 'Q', 'K', 'F', 'p', 'n', 'b', 'r', 'q', 'k', 'f'];
    const bagChars = ['P', 'N', 'B', 'R', 'Q', 'K', 'p', 'n', 'b', 'r', 'q', 'k'];
    
    for (const char of pieceChars) {
        keys.pieces[char] = [];
        for (let row = 0; row < 8; row++) {
            keys.pieces[char][row] = [];
            for (let col = 0; col < 8; col++) {
                keys.pieces[char][row][col] = generateRandomBigInt();
            }
        }
    }

    for (const char of bagChars) {
        keys.bag[char] = generateRandomBigInt();
    }

    return keys;
}

const zobristKeys = initializeZobristKeys();

function checkThreeFoldRepetition() {
    // Convert BigInt key to string for reliable Map lookup
    const hashString = zobristHash.toString();
    const count = positionHistory.get(hashString) || 0;
    
    // If the hash has been seen twice before, the current position is the third instance.
    return count >= 2; 
}

function savePositionToHistory() {
    const hashString = zobristHash.toString();
    
    const currentCount = positionHistory.get(hashString) || 0;
    const newCount = currentCount + 1;
    positionHistory.set(hashString, newCount);

    return newCount;
}



// all the get move functions still need to be validated for checks, pins, can't capture king
// for now, a rook that can pass through all units but cannot capture or threaten king
function getFlagMoves(row, col, pieceType) {
    const directions = [
        [-1, 0],
        [0, 1],
        [1, 0],
        [0, -1],
    ];

    const moves = [];
    for (const [dx, dy] of directions) {
        var targetRow = row;
        var targetCol = col;
        // go until out of bounds or blocked
        while (isInBounds(targetRow + dx, targetCol + dy)) {
            targetRow += dx;
            targetCol += dy;
            if (isEmptySquare(boardState, targetRow, targetCol)) {
                moves.push([targetRow, targetCol]);
            }
            // cannot pass through enemy pieces
            else if (isOppositeColour(pieceType, boardState[targetRow][targetCol])) {
                break;
            }
            // don't break if it is blocked, keep going
        }
        // no capture logic
    }
    return moves;
}

function getPawnMoves(row, col, pieceType) {
    var canMoveTwo = false;
    if (pawnOnStartingRow(row, pieceType)) {
        canMoveTwo = true;
    }
    // white pawns move to decreasing row
    var direction = -1;
    if (isBlackPiece(pieceType)) direction = 1;

    const moves = [];

    // go forward
    const target1 = [row + direction, col];
    if (isInBounds(...target1) && isEmptySquare(boardState, ...target1)) {
        moves.push(target1);

        // only check two-square move if one-square move is valid
        const target2 = [row + 2 * direction, col];
        if (
            canMoveTwo &&
            isInBounds(...target2) &&
            isEmptySquare(boardState, ...target2)
        ) {
            moves.push(target2);
        }
    }

    // captures
    const target3 = [row + direction, col - 1];
    if (
        isInBounds(...target3) &&
        isOppositeColour(pieceType, boardState[target3[0]][target3[1]])
    ) {
        moves.push(target3);
    }
    const target4 = [row + direction, col + 1];
    if (
        isInBounds(...target4) &&
        isOppositeColour(pieceType, boardState[target4[0]][target4[1]])
    ) {
        moves.push(target4);
    }

    // only check en passant starting on the second move to avoid errors
    if (!lastMove.endCoordinate) return moves;

    const [lastMoveRow, lastMoveCol] = fromCoordinate(lastMove.endCoordinate);
    // en passant
    const ROW_WHITE_CAN_EN_PASSANT = 3
    const ROW_BLACK_CAN_EN_PASSANT = 4
    if ((ROW_WHITE_CAN_EN_PASSANT === row && pieceType === "P" ||
        ROW_BLACK_CAN_EN_PASSANT === row && pieceType === "p")
    ) {
        moves.push([lastMoveRow + direction, lastMoveCol]);
    }
    return moves;
}

function getInfiniteDistanceMoves(row, col, directions, pieceType) {
    const moves = [];
    for (const [dx, dy] of directions) {
        var targetRow = row;
        var targetCol = col;
        // go until out of bounds or blocked
        while (isInBounds(targetRow + dx, targetCol + dy)) {
            targetRow += dx;
            targetCol += dy;
            if (isEmptySquare(boardState, targetRow, targetCol)) {
                moves.push([targetRow, targetCol]);
            } else {
                break;
            }
        }

        // if blocked by enemy piece, can capture
        if (
            isInBounds(targetRow, targetCol) &&
            isOppositeColour(pieceType, boardState[targetRow][targetCol])
        ) {
            moves.push([targetRow, targetCol]);
        }
    }
    return moves;
}

function getRookMoves(row, col, pieceType) {
    // up, right, down, left
    const directions = [
        [-1, 0],
        [0, 1],
        [1, 0],
        [0, -1],
    ];

    return getInfiniteDistanceMoves(row, col, directions, pieceType);
}

function getBishopMoves(row, col, pieceType) {
    // up-right, down-right, down-left, up-left
    const directions = [
        [-1, 1],
        [1, 1],
        [1, -1],
        [-1, -1],
    ];

    return getInfiniteDistanceMoves(row, col, directions, pieceType);
}

function getQueenMoves(row, col, pieceType) {
    // rook and bishop moves combined; they are mutually exclusive
    const rookMoves = getRookMoves(row, col, pieceType);
    const bishopMoves = getBishopMoves(row, col, pieceType);
    return [...rookMoves, ...bishopMoves];
}

function getSetDistanceMoves(row, col, directions, pieceType) {
    const moves = [];
    for (const [dx, dy] of directions) {
        const targetRow = row + dx;
        const targetCol = col + dy;
        if (isInBounds(targetRow, targetCol)) {
            if (
                isEmptySquare(boardState, targetRow, targetCol) ||
                isOppositeColour(pieceType, boardState[targetRow][targetCol])
            ) {
                moves.push([targetRow, targetCol]);
            }
        }
    }

    return moves;
}

// validates if we have rights and space to castle, but need to validate checks
function hasSpaceToQueensideCastle(castlingRights, row, col) {
    if (
        castlingRights &&
        isEmptySquare(boardState, row, col - 1) &&
        isEmptySquare(boardState, row, col - 2) &&
        isEmptySquare(boardState, row, col - 3)
    ) return true;
    return false;
}

function hasSpaceToKingsideCastle(castlingRights, row, col) {
    if (
        castlingRights &&
        isEmptySquare(boardState, row, col + 1) &&
        isEmptySquare(boardState, row, col + 2)
    ) return true;
    return false;
}

function getKingMoves(row, col, pieceType) {
    // all 8 directions
    const directions = [
        [-1, 0],
        [-1, 1],
        [0, 1],
        [1, 1],
        [1, 0],
        [1, -1],
        [0, -1],
        [-1, -1],
    ];
    const moves = getSetDistanceMoves(row, col, directions, pieceType);
    // white queenside
    if (turn === "W" && boardState[7][4] === 'K') {
        if (hasSpaceToQueensideCastle(whiteQueenSidePossible, row, col) && boardState[7][0] === 'R') moves.push([row, col - 2]);
        if (hasSpaceToKingsideCastle(whiteKingSidePossible, row, col) && boardState[7][7] === 'R') moves.push([row, col + 2]);
    }
    else if (turn === "B" && boardState[0][4] === 'k') {
        if (hasSpaceToQueensideCastle(blackQueenSidePossible, row, col) && boardState[0][0] === 'r') moves.push([row, col - 2]);
        if (hasSpaceToKingsideCastle(blackKingSidePossible, row, col) && boardState[0][7] === 'r') moves.push([row, col + 2]);
    }
    return moves;
}

function getKnightMoves(row, col, pieceType) {
    // all 8 L-shapes
    const directions = [
        [-2, -1],
        [-2, 1],
        [-1, 2],
        [1, 2],
        [2, 1],
        [2, -1],
        [1, -2],
        [-1, -2],
    ];

    return getSetDistanceMoves(row, col, directions, pieceType);
}

function getPiecePositions(board, colour) {
    const positions = {};
    positions.k = [];
    positions.q = [];
    positions.r = [];
    positions.b = [];
    positions.n = [];
    positions.p = [];
    positions.f = [];

    for (let row = 0; row < SIZE; row++) {
        for (let col = 0; col < SIZE; col++) {
            const piece = board[row][col];
            if (piece === ".") continue;

            const isMyPiece =
                (colour === "W" && !isBlackPiece(piece)) ||
                (colour === "B" && isBlackPiece(piece));
            if (isMyPiece) {
                positions[piece.toLowerCase()].push([row, col]);
            }
        }
    }
    return positions;
}

// refactor to use getPiecePositions?
function locateKing(board, colour) {
    for (let row = 0; row < SIZE; row++) {
        for (let col = 0; col < SIZE; col++) {
            const piece = board[row][col];
            if (colour === "W" && piece === "K") {
                return [row, col];
            }
            if (colour === "B" && piece === "k") {
                return [row, col];
            }
        }
    }
    console.error("Could not locate king of colour: ", colour);
    return [-1, -1];
}

// e.g. R, Q, N, etc...
function hasAttackerAt(board, row, col, myColour, expectedAttackerType) {
    if (!isInBounds(row, col)) return false;
    const piece = board[row][col];
    if (piece === ".") return false;

    return (
        isOppositeColour(myColour, piece) &&
        piece.toLowerCase() === expectedAttackerType.toLowerCase()
    );
}

// TODO: refactor
// colour is "W" or "B"
function isInCheck(board, colour) {
    const [kingRow, kingCol] = locateKing(board, colour);
    const kingPiece = board[kingRow][kingCol];
    // white
    let pawnAttackers = [
        [-1, -1],
        [-1, 1],
    ];

    if (colour === "B") {
        pawnAttackers = [
            [1, -1],
            [1, 1],
        ];
    }

    for (let [dx, dy] of pawnAttackers) {
        if (hasAttackerAt(board, kingRow + dx, kingCol + dy, kingPiece, "P")) {
            return true;
        }
    }
    const knightAttackers = [
        [-2, -1],
        [-2, 1],
        [-1, 2],
        [1, 2],
        [2, 1],
        [2, -1],
        [1, -2],
        [-1, -2],
    ];

    for (let [dx, dy] of knightAttackers) {
        if (hasAttackerAt(board, kingRow + dx, kingCol + dy, kingPiece, "N")) {
            return true;
        }
    }

    const kingAttackers = [
        [-1, 0],
        [-1, 1],
        [0, 1],
        [1, 1],
        [1, 0],
        [1, -1],
        [0, -1],
        [-1, -1],
    ];

    for (let [dx, dy] of kingAttackers) {
        if (hasAttackerAt(board, kingRow + dx, kingCol + dy, kingPiece, "K")) {
            return true;
        }
    }

    const rookDirections = [
        [-1, 0],
        [0, 1],
        [1, 0],
        [0, -1],
    ];

    const bishopDirections = [
        [-1, 1],
        [1, 1],
        [1, -1],
        [-1, -1],
    ];

    for (let [dx, dy] of rookDirections) {
        var targetRow = kingRow;
        var targetCol = kingCol;
        // go until out of bounds or blocked
        while (isInBounds(targetRow + dx, targetCol + dy)) {
            targetRow += dx;
            targetCol += dy;
            var attacker = board[targetRow][targetCol];
            if (
                isOppositeColour(attacker, kingPiece) &&
                ["r", "q"].includes(attacker.toLowerCase())
            ) {
                return true;
                // blocked, stop checking this direction
            } else if (!isEmptySquare(board, targetRow, targetCol)) {
                break;
            }
            // continue otherwise
        }
    }

    for (let [dx, dy] of bishopDirections) {
        var targetRow = kingRow;
        var targetCol = kingCol;
        // go until out of bounds or blocked
        while (isInBounds(targetRow + dx, targetCol + dy)) {
            targetRow += dx;
            targetCol += dy;
            var attacker = board[targetRow][targetCol];
            if (
                isOppositeColour(attacker, kingPiece) &&
                ["b", "q"].includes(attacker.toLowerCase())
            ) {
                return true;
                // blocked, stop checking this direction
            } else if (!isEmptySquare(board, targetRow, targetCol)) {
                break;
            }
            // continue otherwise
        }
    }

    return false;
}

function getPossibleMoves(row, col, pieceType) {
    var bag = whiteBag;
    if (turn === "B") bag = blackBag;
    if (pieceType.toLowerCase() !== "f" && !bag.has(pieceType.toLowerCase()))
        return [];

    if (pieceType.toLowerCase() === "f") {
        return getFlagMoves(row, col, pieceType);
    }
    if (pieceType.toLowerCase() === "p") {
        return getPawnMoves(row, col, pieceType);
    }
    if (pieceType.toLowerCase() === "r") {
        return getRookMoves(row, col, pieceType);
    }
    if (pieceType.toLowerCase() === "b") {
        return getBishopMoves(row, col, pieceType);
    }
    if (pieceType.toLowerCase() === "q") {
        return getQueenMoves(row, col, pieceType);
    }
    if (pieceType.toLowerCase() === "k") {
        return getKingMoves(row, col, pieceType);
    }
    if (pieceType.toLowerCase() === "n") {
        return getKnightMoves(row, col, pieceType);
    }
    console.log("Error. Unknown piece type:", pieceType);
    return [];
}


// this function will handle zobrist hash changes, but since it is called
// in multiple places, we will return the hash instead of modifying it
// so only the call in makeMove will update the zobrist hash (as opposed to the ones in hypothetical board moves)
function updateBoard(
    board,
    pieceType,
    startRow,
    startCol,
    targetRow,
    targetCol
) {
    var currentHash = zobristHash;

    // remove piece from starting square
    currentHash ^= zobristKeys.pieces[pieceType][startRow][startCol];

    const WHITEROW = 7;
    const BLACKROW = 0;
    const QUEENSIDE = 3;
    const KINGSIDE = 5;
    const QUEENSIDEROOK = 0;
    const KINGSIDEROOK = 7;

    board[startRow][startCol] = ".";

    // en passant happens if piece is a pawn, the startCol and targetCol are different, and the 
    // target square is empty (i.e. we move columns without directly capturing on to a piece)
    if (pieceType.toLowerCase() === "p" && startCol !== targetCol && board[targetRow][targetCol] === ".") {
        // en passant captures the piece immediately behind, so determine forward direction first,
        // then flip it to get the opposite direction of movement
        var forward = -1;
        if (isBlackPiece(pieceType)) forward = 1;
        const backward = forward * -1;
        board[targetRow + backward][targetCol] = ".";
        console.log('en passant!');
    }

    // tracks the piece that will eventually go into the target square
    // either it is a queen because it promoted, or it is just the piece that moved
    var newPieceAtTarget = pieceType;
    // handle promotion -- auto queen
    // since pawns can't move backwards, just using the target row is sufficient to determine the colour
    if (pieceType.toLowerCase() === "p" && targetRow === BLACKROW) newPieceAtTarget = "Q";
    else if (pieceType.toLowerCase() === "p" && targetRow === WHITEROW) newPieceAtTarget = "q";

    const capturedPiece = board[targetRow][targetCol];
    if (capturedPiece !== ".") {
        // remove captured piece from hash
        currentHash ^= zobristKeys.pieces[capturedPiece][targetRow][targetCol];
    }

    board[targetRow][targetCol] = newPieceAtTarget;
    // move piece to target square in the hash
    currentHash ^= zobristKeys.pieces[newPieceAtTarget][targetRow][targetCol];

    const targetCoordinate = toCoordinate(targetRow, targetCol);
    
    // this is a castle since king moves 2 squares, need to additionally move the rook
    if (pieceType.toLowerCase() === "k" && Math.abs(startCol - targetCol) === 2) {
        // need to update the zobrist hash for the rook move as well
        // rook should be hashed out of its original square and into its new square
        if (targetCoordinate === "c1") {
            board[WHITEROW][QUEENSIDEROOK] = ".";
            board[WHITEROW][QUEENSIDE] = "R";
            currentHash ^= zobristKeys.pieces["R"][WHITEROW][QUEENSIDEROOK];
            currentHash ^= zobristKeys.pieces["R"][WHITEROW][QUEENSIDE];
        }
        else if (targetCoordinate === "g1") {
            board[WHITEROW][KINGSIDEROOK] = ".";
            board[WHITEROW][KINGSIDE] = "R";
            currentHash ^= zobristKeys.pieces["R"][WHITEROW][KINGSIDEROOK];
            currentHash ^= zobristKeys.pieces["R"][WHITEROW][KINGSIDE];
        }
        else if (targetCoordinate === "c8") {
            board[BLACKROW][QUEENSIDEROOK] = ".";
            board[BLACKROW][QUEENSIDE] = "r";
            currentHash ^= zobristKeys.pieces["r"][BLACKROW][QUEENSIDEROOK];
            currentHash ^= zobristKeys.pieces["r"][BLACKROW][QUEENSIDE];
        }
        else if (targetCoordinate === "g8") {
            board[BLACKROW][KINGSIDEROOK] = ".";
            board[BLACKROW][KINGSIDE] = "r";
            currentHash ^= zobristKeys.pieces["r"][BLACKROW][KINGSIDEROOK];
            currentHash ^= zobristKeys.pieces["r"][BLACKROW][KINGSIDE];
        }
    }

    return currentHash;
}

// will need to handle castling specifically later
// if the moved piece is a king, and the distance it moves is 2, then it must be castling
// then can check all the spots along the castle operation to check if valid, and if it is in check
function getLegalMoves(startRow, startCol, pieceType, moves) {
    // for a move to be legal, your king cannot be in check next turn
    // (whether or not you were put in check, or if the move is putting yourself in check)
    
    const WHITEROW = 7;
    const BLACKROW = 0;
    const QUEENCROSS = 3;
    const KINGCROSS = 5;
    const filtered = moves.filter(([row, col]) => {
        // castling case
        if (pieceType.toLowerCase() === "k" && Math.abs(startCol - col) === 2) {
            // can't castle while in check
            if (isInCheck(boardState, turn)) {
                return false;
            }

            const targetCoordinate = toCoordinate(row, col);
            const hypotheticalBoard = structuredClone(boardState);
            
            // check if the crossing square is attacked
            // queenside white
            if (targetCoordinate === "c1") {
                hypotheticalBoard[WHITEROW][QUEENCROSS] = "K";
            }
            // kingside white
            else if (targetCoordinate === "g1") {
                hypotheticalBoard[WHITEROW][KINGCROSS] = "K";
            }
            // queenside black
            else if (targetCoordinate === "c8") {
                hypotheticalBoard[BLACKROW][QUEENCROSS] = "k";
            }
            // king side black
            else if (targetCoordinate === "g8") {
                hypotheticalBoard[BLACKROW][KINGCROSS] = 'k';
            }
            // remove the duplicate king just for safety, but it shouldn't change whether it is in check or not
            hypotheticalBoard[startRow][startCol] = ".";

            if (isInCheck(hypotheticalBoard, turn)) return false;
        }
        
        if (pieceType.toLowerCase() === "f") {
            const hypotheticalBoard2 = structuredClone(boardState);
            
            // need to move the flag piece before trying to move the passenger, in case the 
            // passenger is moving into the flag piece's old spot
            updateBoard(hypotheticalBoard2, pieceType, startRow, startCol, row, col);
            tryMoveFlagPassenger(hypotheticalBoard2, pieceType, startRow, startCol, row, col);
 
            if (isInCheck(hypotheticalBoard2, turn)) {
                return false;
            }
        }
        else {
            // this should be checked even if castling, since you can't end in check after castling
            // but should be handled separately to flag move, because this only checks moving the piece in question
            // whereas flag has a separate logic check that would move a passenger
            // this would then only move the flag piece, potentially leaving the king behind, causing it to
            // think the king is still in check
            const hypotheticalBoard3 = structuredClone(boardState);
            updateBoard(hypotheticalBoard3, pieceType, startRow, startCol, row, col);
            if (isInCheck(hypotheticalBoard3, turn)) return false;
        }
            
        return true;
    });
    return filtered;
}

function endGame() {
    // disable all piece dragging and clicking
    const pieces = document.getElementsByClassName("piece-button");
    for (const piece of pieces) {
        piece.draggable = false;
        piece.removeEventListener("click", handlePieceClick);
        piece.style.cursor = "default";
    }
}

function detectEndOfGame() {
    if (checkThreeFoldRepetition()) {
        console.log("Threefold repetition! Game Over.");
        return;
    }

    const inCheck = isInCheck(boardState, turn);

    // iterate through all pieces of the current player and look for legal moves.
    let legalMoveExists = false;
    let hasSurvivingPieceWithBagRights = false;
    let bagToUse = (turn === "W") ? whiteBag : blackBag;

    for (let row = 0; row < SIZE; row++) {
        for (let col = 0; col < SIZE; col++) {
            const pieceType = boardState[row][col];
            if (pieceType === ".") continue;

            const isMyPiece =
                (turn === "W" && !isBlackPiece(pieceType)) ||
                (turn === "B" && isBlackPiece(pieceType));
            if (!isMyPiece) continue;
            
            if (pieceType.toLowerCase() === 'f' || bagToUse.has(pieceType.toLowerCase())) {
                // ff this is true, the player has at least one piece they have the right to move.
                // if no legal moves are found, it must be a traditional stalemate.
                hasSurvivingPieceWithBagRights = true; 

                const possibleMoves = getPossibleMoves(row, col, pieceType);
                const legalMoves = getLegalMoves(
                    row,
                    col,
                    pieceType,
                    possibleMoves
                );

                // not checkmate if any legal move exists
                if (legalMoves.length > 0) {
                    legalMoveExists = true;
                    break;
                }
            }
        }
        if (legalMoveExists) {
            break;
        }
    }

    if (!legalMoveExists) {
         // simple checkmate
        if (inCheck) {
            endGameUI(`Checkmate! ${turn === "W" ? "Black" : "White"} wins.`);
        } 
        // not in check, but no legal moves.
        else {
            if (hasSurvivingPieceWithBagRights) {
                // they had the *right* to move a piece, but that piece was trapped.
                endGameUI("Stalemate! It's a draw.");
            } else {
                // they had no legal moves because the bag restricted all their pieces
                // this is the new bagmate.
                endGameUI(`Bagmate! ${turn === "W" ? "Black" : "White"} wins.`);
            }
        }
    }
}

function bagHasNoMoves(bag) {
    const positions = getPiecePositions(boardState, turn);

    // iterate through pieceTypes in the given bag (stores lowercase)
    for (const pieceType of bag) {
        // Find the actual piece character (uppercase for White, lowercase for Black)
        const pieceChar =
            turn === "W" ? pieceType.toUpperCase() : pieceType.toLowerCase();

        const piecesOfThisType = positions[pieceType];
        if (!piecesOfThisType) continue;

        for (const [row, col] of piecesOfThisType) {
            // get all possible moves for the piece at this position
            const possibleMoves = getPossibleMoves(row, col, pieceChar);
            const legalMoves = getLegalMoves(
                row,
                col,
                pieceChar,
                possibleMoves
            );

            if (legalMoves.length > 0) {
                return false;
            }
        }
    }
    // return true if none of the pieces in the bag have moves to make (i.e. have to reset the bag)
    return true;
}

function renderBags() {
    for (const pieceType of pieceList) {
        const whiteBagPiece = document.getElementById(
            `white-bag-${MAPPING[pieceType]}`
        );
        if (whiteBag.has(pieceType)) {
            whiteBagPiece.classList.remove("used-piece");
        } else {
            whiteBagPiece.classList.add("used-piece");
        }
        const blackBagPiece = document.getElementById(
            `black-bag-${MAPPING[pieceType]}`
        );
        if (blackBag.has(pieceType)) {
            blackBagPiece.classList.remove("used-piece");
        } else {
            blackBagPiece.classList.add("used-piece");
        }
    }
}


// blackQueenSidePossible, blackKingSidePossible, whiteQueenSidePossible, whiteKingSidePossible
function updateCastlingStateAfterMove(pieceType, startingSquare, endingSquare) {
    let bq = blackQueenSidePossible;
    let bk = blackKingSidePossible;
    let wq = whiteQueenSidePossible;
    let wk = whiteKingSidePossible;

    // one of the involved pieces moves
    if (pieceType === "K") {
        wk = false;
        wq = false;
    } else if (pieceType === "k") {
        bk = false;
        bq = false;
    } else if (pieceType === "R") {
        if (startingSquare === "a1") {
            wq = false;
        } else if (startingSquare === "h1") {
            wk = false;
        }
    } else if (pieceType === "r") {
        if (startingSquare === "a8") {
            bq = false;
        } else if (startingSquare === "h8") {
            bk = false;
        }
    }

    // square is the ending location, so if it ends on one of the rook locations
    // the rook must have been captured
    if (endingSquare === "a1") {
        wq = false;
    } else if (endingSquare === "h1") {
        wk = false;
    } else if (endingSquare === "a8") {
        bq = false;
    } else if (endingSquare === "h8") {
        bk = false;
    }

    return [bq, bk, wq, wk];
}

// passengerSquare is in the opposite direction of movement
function getFlagPassengerDirection(startRow, startCol, endRow, endCol) {
    var passengerDirection = [0, 0];
    if (startRow < endRow) passengerDirection = [-1, 0];
    else if (startRow > endRow) passengerDirection = [1, 0];
    else if (startCol < endCol) passengerDirection = [0, -1];
    else if (startCol > endCol) passengerDirection = [0, 1];

    return passengerDirection
}

function getFlagPassengerSquare(startRow, startCol, passengerDirection) {
    return [startRow + passengerDirection[0], startCol + passengerDirection[1]];
}

// updates zobrist hash for moving passenger piece of a flag bearer move
// it also updates the board state to handle the actual move
// returns the new hash since this is called for hypothetical moves as well
// it should only update on actual moves
function handlePassengerMove(board, passengerPiece, startRow, startCol, endRow, endCol) {
    var currentHash = zobristHash;
    const startingCoordinate = toCoordinate(startRow, startCol);
    const endingCoordinate = toCoordinate(endRow, endCol);

    // remove passenger piece from source square
    currentHash ^= zobristKeys.pieces[passengerPiece][startRow][startCol];
    
    // add passenger piece to target square
    currentHash ^= zobristKeys.pieces[passengerPiece][endRow][endCol];

    // board uodate
    board[startRow][startCol] = ".";
    board[endRow][endCol] = passengerPiece;

    // Update the global boolean flags based on the passenger's movement
    const currentCastlingRights = [
        blackQueenSidePossible, blackKingSidePossible, 
        whiteQueenSidePossible, whiteKingSidePossible
    ];
    // do NOT update global state for new rights yet. this is updated higher in the call stack
    const newCastlingRights = updateCastlingStateAfterMove(passengerPiece, startingCoordinate, endingCoordinate);

    // Update Zobrist Hash for lost rights (XOR OUT any rights that went from true -> false)
    updateZobristCastling(currentCastlingRights, newCastlingRights);

    return [currentHash, newCastlingRights];
}

// Cannot move pawns.
// this might move a king into check or cause a check state, so flag moves should be validated first
// since this function is called for hypothetical moves
// we need it to return the updated castling rights for makeMove to update
// handlePasengerMove will return the updated castling rights
// which comes from updateCastlingStateAfterMove
function tryMoveFlagPassenger(board, pieceType, startRow, startCol, endRow, endCol) {
    const passengerDirection = getFlagPassengerDirection(startRow, startCol, endRow, endCol);   
    const passengerSquare = getFlagPassengerSquare(startRow, startCol, passengerDirection);
    // move passenger
    if (isInBounds(...passengerSquare)) {
        var passengerPiece = board[passengerSquare[0]][passengerSquare[1]];
        const passengerTargetSquare = [endRow + passengerDirection[0], endCol + passengerDirection[1]];
        if (isEmptySquare(board, ...passengerTargetSquare) 
            && isSameColour(pieceType, passengerPiece) 
            && passengerPiece.toLowerCase() !== "p") {
            const hashAndCastlingRights = handlePassengerMove(
                board, 
                passengerPiece, 
                ...passengerSquare, 
                ...passengerTargetSquare
            );
            return hashAndCastlingRights;
        }
    }
    return null;
}

// Cleares the old en passant hash key if it exists
// also updates the global state en passant column
function clearOldEnPassantHash() {
    if (zobristEnPassant !== -1) {
        zobristHash ^= zobristKeys.enPassant[zobristEnPassant];
    }
    zobristEnPassant = -1;
}

// updates the hash and updates the global state
function setNewEnPassantHash(newCol) {
    if (newCol !== -1) {
        zobristHash ^= zobristKeys.enPassant[newCol];
    }
    zobristEnPassant = newCol; 
}

// currentRights should be saved before newRights are determined
// called once after new castling rights are determined
function updateZobristCastling(currentRights, newRights) {
    const castlingKeys = ['q', 'k', 'Q', 'K'];
    for (let i = 0; i < currentRights.length; i++) {
        if (currentRights[i] === true && newRights[i] === false) {
            // rights changed, so toggle it
            // it will never get toggled back on since rights can only go from true to false
            zobristHash ^= zobristKeys.castling[castlingKeys[i]];
        }
    }
}

// either B or W as input
function disablePieces(toDisable) {
    if (toDisable !== "B" && toDisable !== "W") {
        console.error("Invalid colour to disable pieces:", toDisable);
        return;
    }

    const pieces = document.getElementsByClassName("piece-button");
    for (const piece of pieces) {
        const coordinate = fromCoordinate(piece.parentElement.id);
        const row = coordinate[0];
        const col = coordinate[1];
        const pieceType = boardState[row][col];

        if ((!isBlackPiece(pieceType) && toDisable === "W") ||
            (isBlackPiece(pieceType) && toDisable === "B")) {
            
            // Also disable on the button
            piece.draggable = false; // Note: You had this, but it's the image that matters most
            piece.style.cursor = "default";
            
            // Remove the click listener
            piece.removeEventListener("click", handlePieceClick);
            piece.removeEventListener("dragstart", handleDragStart); // Also remove drag listener
        }
    }
}

function enablePieces(toEnable) {
    if (toEnable !== "B" && toEnable !== "W") {
        console.error("Invalid colour to enable pieces:", toEnable);
        return;
    }
    
    const pieces = document.getElementsByClassName("piece-button");
    for (const piece of pieces) {
        const coordinate = fromCoordinate(piece.parentElement.id);
        const row = coordinate[0];
        const col = coordinate[1];
        const pieceType = boardState[row][col];
        if ((pieceType === pieceType.toUpperCase() && toEnable === "W") ||
            (pieceType === pieceType.toLowerCase() && toEnable === "B")) {
            piece.draggable = true;
            piece.addEventListener("click", handlePieceClick);
            piece.style.cursor = "grab";
        }
    }
}


// call this before the turn changes, so enable the next player's and disable the current player's
function flipPiecesEnabled() {
    if (turn === "W") {
        disablePieces("W");
        enablePieces("B");
    } else {
        disablePieces("B");
        enablePieces("W");
    }
}

async function makeMove(pieceType, startRow, startCol, event) {
    flipPiecesEnabled();

    // give grace period for first move for each player
    if (turn === "W" && waitingForWhiteFirstMove) {
        waitingForWhiteFirstMove = false;
    }
    else if (turn === "B" && waitingForBlackFirstMove) {
        whiteTimer.start(); // start the white timer after both players made their first move
        waitingForBlackFirstMove = false;
    }
    else if (!waitingForBlackFirstMove && !waitingForWhiteFirstMove) {
        flipTimer(whiteTimer, blackTimer);
    }

    const parent = event.target.parentElement;
    const startingSquare = toCoordinate(startRow, startCol);
    const endingSquare = parent.id;
    const [endRow, endCol] = fromCoordinate(endingSquare);

    // Handle en passant for Zobrist hashing
    clearOldEnPassantHash();
    let newEnPassantCol = -1;
    if (pieceType.toLowerCase() === "p" && Math.abs(startRow - endRow) === 2) {
        newEnPassantCol = endCol; 
    }
    setNewEnPassantHash(newEnPassantCol);
    
    const currentCastlingRights = [
        blackQueenSidePossible, blackKingSidePossible, 
        whiteQueenSidePossible, whiteKingSidePossible
    ];
    const newCastlingRights = updateCastlingStateAfterMove(pieceType, startingSquare, endingSquare);
    [
        blackQueenSidePossible, blackKingSidePossible, 
        whiteQueenSidePossible, whiteKingSidePossible
    ] = newCastlingRights;
    updateZobristCastling(currentCastlingRights, newCastlingRights);
    
    // updateBoard returns the new zobrist hash after the move
    // updateBoard handles promotion, castling, capturing, and moving updates
    zobristHash = updateBoard(boardState, pieceType, startRow, startCol, endRow, endCol);

    // handle flag move specifically
    // move passenger after moving the piece so it is allowed to move into the flag piece's old spot
    if (pieceType.toLowerCase() === "f") {
        // need to update hash and castling rights outside the tryMoveFlagPassenger function
        // because it is called in hypothetical board checks, which we don't want to update the global state yet
        const hashAndCastlingRights = tryMoveFlagPassenger(boardState, pieceType, startRow, startCol, endRow, endCol);
        // it can be null if no passenger move was made
        if (hashAndCastlingRights) {
            zobristHash = hashAndCastlingRights[0];
            const newCastlingRights = hashAndCastlingRights[1];
            [
                blackQueenSidePossible,
                blackKingSidePossible,
                whiteQueenSidePossible,
                whiteKingSidePossible
            ] = newCastlingRights;
        }
    }

    lastMove.piece = pieceType;
    lastMove.endCoordinate = endingSquare;

    if (turn === "W") {
        var bagToUse = whiteBag;
    } else {
        bagToUse = blackBag;
    }
    bagToUse.delete(pieceType.toLowerCase());
    // toggle bag move rights for the piece in the zobrist hash
    if (pieceType.toLowerCase() !== 'f') {
        zobristHash ^= zobristKeys.bag[pieceType];
    }
    
    if (bagHasNoMoves(bagToUse)) {
        // need to duplicate this check since JS can't dereference pointers to actually update the real bag
        // using the bagToUse variable
        if (turn === "W") {
            // toggle the current rights once because everything is about to be toggled once
            // and toggling twice would cancel out
            for (var oldPiece of bagToUse) {
                zobristHash ^= zobristKeys.bag[oldPiece.toUpperCase()];
            }
            whiteBag = new Set([...pieceList]);
            for (var newPiece of pieceList  ) {
                zobristHash ^= zobristKeys.bag[newPiece.toUpperCase()];
            }
        } else {
            for (var oldPiece of bagToUse) {
                zobristHash ^= zobristKeys.bag[oldPiece.toLowerCase()];
            }
            blackBag = new Set([...pieceList]);
            for (var newPiece of pieceList) {
                zobristHash ^= zobristKeys.bag[newPiece.toLowerCase()];
            }
        }
        
    }

    renderBags();

    if (turn === "W") {
        turn = "B";
    } else {
        turn = "W";
    }
    // toggle turn in zobrist hash
    zobristHash ^= zobristKeys.side;
    
    if (turn === "W") {
        var bagToHighlight = document.getElementById("white-bag");
        var bagToUnhighlight = document.getElementById("black-bag");
    } else {
        var bagToHighlight = document.getElementById("black-bag");
        var bagToUnhighlight = document.getElementById("white-bag");
    }
    bagToHighlight.classList.add("green-background");
    bagToUnhighlight.classList.remove("green-background");

    clearIndicators();
    renderBoard(boardState);

    if (currentGameId) {
        const gameRef = doc(db, "games", currentGameId);
        
        // Prepare the packet
        const newState = getCurrentGameStateForDB();
        
        // Send to Firebase
        // Note: We use updateDoc (not setDoc) to avoid overwriting fields we didn't include
        await updateDoc(gameRef, newState);
        console.log("Move sent to database!");
    }

    savePositionToHistory(); // after hash is fully updated, store the occurence
    detectEndOfGame(); // will check the hash in this function
}

function clearIndicators() {
    // don't clear check-indicators, they will be removed when board is re-rendered
    // we want them to stay until the move is made
    removeElementsByClass("move-indicator");

    // the move button is the click box, which is separate from just the indicator
    removeElementsByClass("move-button");
    removeElementsByClass("capture-indicator");
}

// pieceType is the piece being moved
function renderMoves(pieceType, startRow, startCol, moves) {
    clearIndicators();

    for (const coordinate of moves) {
        const [row, col] = fromCoordinate(coordinate);
        const square = document.getElementById(coordinate);

        const fullSquareClickBox = document.createElement("div");
        fullSquareClickBox.classList.add("click-box");
        const indicator = document.createElement("button");
        fullSquareClickBox.appendChild(indicator);

        fullSquareClickBox.addEventListener("click", (event) => {
            makeMove(pieceType, startRow, startCol, event);
        });
        fullSquareClickBox.classList.add("move-button");

        // guaranteed it is an opponent piece (via the getPossibleMoves call) if not empty square
        if (boardState[row][col] !== ".") {
            indicator.classList.add("capture-indicator");
        } else {
            indicator.classList.add("move-indicator");
        }
        square.appendChild(fullSquareClickBox);
    }
}

// if a user clicks a blank square, assume they want to hide the move indicators
function handleSquareClick(event) {
    if (event.target.classList.contains("square")) {
        clearIndicators();
        // next click should bring up the move indicators again, so reset this
        lastClickedPieceLocation = null;
    }
}

function handlePieceClick(event) {
    const parent = event.target.parentElement;
    const square = parent.parentElement.id;

    // if we click the same piee again, assume user wants to hide the move indicators again
    if (lastClickedPieceLocation === square) {
        clearIndicators();
        // reset back to null, so the next time the user clicks, it will be as if it is the first time
        lastClickedPieceLocation = null;
        return;
    }
    lastClickedPieceLocation = square;

    const pieceType = pieceFromCoordinate(square);

    const moves = getLegalMoves(
        ...fromCoordinate(square),
        pieceType,
        getPossibleMoves(...fromCoordinate(square), pieceType)
    );
    renderMoves(pieceType, ...fromCoordinate(square), convertMoves(moves));
}

function handleDragStart(event) {
    const startSquare = event.currentTarget.parentElement.id;
    const [startRow, startCol] = fromCoordinate(startSquare);
    const pieceType = pieceFromCoordinate(startSquare);

    event.dataTransfer.setData(DRAG_DATA_KEY, startSquare);
    // specifically allow move option. Still works without it, but good for robustness
    event.dataTransfer.effectAllowed = "move"; 

    // to show move indicators on drag as well
    const possibleMoves = getPossibleMoves(startRow, startCol, pieceType);
    const legalMoves = getLegalMoves(startRow, startCol, pieceType, possibleMoves);
    renderMoves(pieceType, startRow, startCol, convertMoves(legalMoves));
}

function handleDragOver(event) {
    event.preventDefault(); // need this to allow dropping (by default, it is prevented)
    // Works in combination with the line in handleDragStart
    // technically removable, but good for robustness apparently
    event.dataTransfer.dropEffect = "move";
}

function handleDrop(event) {
    event.preventDefault();

    const startSquare = event.dataTransfer.getData(DRAG_DATA_KEY);
    // happens if dragging a piece different than the current turn, since it is not set
    // this prevents errors in the webconsole when that happens
    if (!startSquare) return;

    const endSquareElement = event.currentTarget;
    const endSquare = endSquareElement.id;

    const [startRow, startCol] = fromCoordinate(startSquare);
    const pieceType = pieceFromCoordinate(startSquare);
    const [endRow, endCol] = fromCoordinate(endSquare);
    
    // check if the drop location is a legal move
    // this could technically be removed, but this validation
    // prevents errors when calling the function that would appear in the web console
    const possibleMoves = getPossibleMoves(startRow, startCol, pieceType);
    const legalMoves = getLegalMoves(startRow, startCol, pieceType, possibleMoves);
    const isLegalDrop = legalMoves.some(([r, c]) => r === endRow && c === endCol);
    
    if (isLegalDrop) {
        // construct a fake event object to pass to makeMove
        // give it the target it would receive if that button was clicked
        const fakeEvent = {
            target: endSquareElement.querySelector('.move-button')
        };
        makeMove(pieceType, startRow, startCol, fakeEvent);
    }
}

function renderBoard(board) {
    // clear board to prevent id duplication
    removeElementsByClass("piece-image");
    removeElementsByClass("piece-button");
    const check = isInCheck(boardState, turn);
    const [checkedRow, checkedCol] = locateKing(boardState, turn);

    for (let row = 0; row < SIZE; row++) {
        for (let col = 0; col < SIZE; col++) {
            if (board[row][col] === ".") continue;
            const square = document.getElementById(toCoordinate(row, col));

            // each piece is a button
            const button = document.createElement("button");

            // activate button and attach handler
            button.classList.add("piece-button");
            if (
                (isBlackPiece(board[row][col]) && turn === "B") ||
                (!isBlackPiece(board[row][col]) && turn === "W")
            ) {
                button.addEventListener("click", handlePieceClick);
                button.addEventListener("dragstart", handleDragStart);
            }
            // if not the current player's piece, disable it
            else {
                button.draggable = false;
                button.style.cursor = "default";
            }

            // Indicate check; put inside button so the user can still select the button to move the king
            // Since position is absolute, this does not impace the rendering of the elements
            if (check && row === checkedRow && col === checkedCol) {
                const indicator = document.createElement("div");
                indicator.classList.add("check-indicator");
                button.appendChild(indicator);
            }

            // put image inside button
            const piece = document.createElement("img");
            button.appendChild(piece);
            piece.classList.add("piece-image");
            piece.draggable = true; 
            
            const pieceType = board[row][col];
            if (pieceType === pieceType.toUpperCase()) {
                piece.src = `pieces/${pieceType.toLowerCase()}.png`;
            } else {
                piece.src = `pieces/b${pieceType.toLowerCase()}.png`;
            }

            // put button in square
            square.appendChild(button);
        }
    }
}

function initializeZobristHash() {
    // A. Hash all Pieces on the Board
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const pieceChar = boardState[row][col];
            
            if (pieceChar !== '.') {
                // XOR the key for the specific piece at the specific [row][col]
                zobristHash ^= zobristKeys.pieces[pieceChar][row][col];
            }
        }
    }

    // B. Hash Side to Move (White to move at start, so we do NOT XOR the ZobristKeys.side)
    // The starting hash implicitly represents White to move.
    // If it were Black to move, we would do: hash ^= ZobristKeys.side;

    // C. Hash Castling Rights
    // In the standard starting position, all four rights are available.
    zobristHash ^= zobristKeys.castling['K'];
    zobristHash ^= zobristKeys.castling['Q'];
    zobristHash ^= zobristKeys.castling['k'];
    zobristHash ^= zobristKeys.castling['q'];

    // D. Hash En Passant Target
    // In the standard starting position, there is no E.P. target.
    // Therefore, no E.P. key is XORed.

    // E. Bag State is also hashed
    const bagChars = ['P', 'N', 'B', 'R', 'Q', 'K', 'p', 'n', 'b', 'r', 'q', 'k'];
    for (const pieceType of bagChars) {
        zobristHash ^= zobristKeys.bag[pieceType];
    }
}

class ChessTimer {
    constructor(elementId, initialSeconds = 600) {
        this.element = document.getElementById(elementId);
        if (!this.element) {
            console.error(`Timer element with ID "${elementId}" not found.`);
            return;
        }
        
        this.initialTimeInMs = initialSeconds * 1000;
        this.remainingTimeInMs = this.initialTimeInMs;
        
        this.isRunning = false;
        this.deadline = null; // The exact timestamp when the timer should end
        this.rafId = null; // Stores the requestAnimationFrame ID
        
        this.updateDisplay(); // Show initial time
    }

    setTime(timeInMs) {
        this.remainingTimeInMs = Math.max(0, timeInMs);
        this.updateDisplay();
    }

    /**
     * Updates the timer's HTML element.
     */
    updateDisplay() {
        if (this.element) {
            this.element.textContent = this.formatTime();
        }
    }

    /**
     * Formats remaining milliseconds into a time string.
     * - h:mm:ss if time is >= 1 hour.
     * - mm:ss if time is >= 10 seconds.
     * - ss.ms (e.g., 09.456) if time is < 10 seconds.
     */
    formatTime() {
        const totalMs = Math.max(0, this.remainingTimeInMs);
        const pad = (num, length = 2) => Math.floor(num).toString().padStart(length, '0');

        // --- Under 10 seconds: Show ss.ms ---
        if (totalMs < 10000) {
            const seconds = totalMs / 1000;
            const s = pad(seconds);
            const ms = pad(totalMs % 1000, 3);
            return `${s}.${ms}`;
        }

        // --- 10 seconds or more: Show h:mm:ss or mm:ss ---
        // We use Math.ceil to ensure the display ticks down by 1 second
        const totalSeconds = Math.ceil(totalMs / 1000);
        
        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const s = totalSeconds % 60;

        if (h > 0) {
            // Only show hours if it's non-zero
            return `${h}:${pad(m)}:${pad(s)}`;
        } else {
            // Show mm:ss
            return `${pad(m)}:${pad(s)}`;
        }
    }

    tick() {
        if (!this.isRunning) return;

        // Calculate time left based on the deadline
        const timeRemaining = this.deadline - Date.now();
        
        // Store the previous display value (in seconds) to check against
        const lastDisplayedSecond = Math.ceil(this.remainingTimeInMs / 1000);
        
        this.remainingTimeInMs = timeRemaining;

        if (this.remainingTimeInMs <= 0) {
            // Time is up
            this.remainingTimeInMs = 0;
            this.updateDisplay();
            this.stop(); // This also clears the animation frame
            endGameUI(`Timeout! ${turn === "W" ? "Black" : "White"} wins.`);
        } else {
            // Still running
            const newDisplayedSecond = Math.ceil(this.remainingTimeInMs / 1000);

            // We only update the DOM (which is expensive) if:
            // 1. We are in millisecond mode (< 10s), which needs constant updates.
            // 2. The displayed second has actually changed (e.g., from 11s to 10s).
            if (this.remainingTimeInMs < 10000 || newDisplayedSecond !== lastDisplayedSecond) {
                this.updateDisplay();
            }
            
            // Request the next frame
            this.rafId = requestAnimationFrame(this.tick.bind(this));
        }
    }

    start() {
        if (this.isRunning || this.remainingTimeInMs <= 0) return;

        this.isRunning = true;
        
        // Set the new deadline by adding the remaining time to the current time
        this.deadline = Date.now() + this.remainingTimeInMs;
        
        // Start the animation loop
        this.rafId = requestAnimationFrame(this.tick.bind(this));
    }

    stop() {
        if (!this.isRunning) return;

        this.isRunning = false;
        cancelAnimationFrame(this.rafId);
        
        // This is the critical part:
        // We calculate and save the *exact* remaining milliseconds.
        // If the deadline hasn't been reached, this will be a positive number.
        // If time ran out (in the tick), this will be 0 or negative.
        this.remainingTimeInMs = this.deadline - Date.now();
        
        // Clamp at 0
        if (this.remainingTimeInMs < 0) {
            this.remainingTimeInMs = 0;
        }
        
        // Update the display to show the final paused time
        this.updateDisplay();
    }

    toggle() {
        if (this.isRunning) {
            this.stop();
        } else {
            this.start();
        }
    }

    reset() {
        this.stop();
        this.remainingTimeInMs = this.initialTimeInMs;
        this.updateDisplay();
    }
}

function flipTimer(timer1, timer2) {
    timer1.toggle();
    timer2.toggle();
}

function endGameUI(message) {
    setMessage(message);
    blackTimer.stop();
    whiteTimer.stop();
    disablePieces("B");
    disablePieces("W");
}

function setMessage(text) {
    const messageElement = document.getElementById("message-text");
    messageElement.textContent = text;
}

function init() {
    for (let row = 0; row < SIZE; row++) {
        for (let col = 0; col < SIZE; col++) {
            const square = document.createElement("div");
            const coordinateLabel = document.createElement("p");
            const label = toCoordinate(row, col);
            coordinateLabel.textContent = label;
            square.id = label;
            coordinateLabel.classList.add("coord-label");
            square.appendChild(coordinateLabel);
            square.classList.add("square");
            
            square.addEventListener("click", handleSquareClick);
            // squares need these drop listners to enable piece dragging for moving
            square.addEventListener("dragover", handleDragOver);
            square.addEventListener("drop", handleDrop);

            // Determine the color:
            // (row + col) is even for light squares (e.g., A1, B2)
            // (row + col) is odd for dark squares (e.g., A2, B1)
            const isLight = (row + col) % 2 === 0;

            if (isLight) {
                square.classList.add("light");
            } else {
                square.classList.add("dark");
            }

            board.appendChild(square);
        }
    }
    initializeZobristHash();

    const STARTING_TIME_SECONDS = 600; // 10 minutes
    blackTimer = new ChessTimer("black-timer-text", STARTING_TIME_SECONDS);
    whiteTimer = new ChessTimer("white-timer-text", STARTING_TIME_SECONDS);
    disablePieces("B");
    enablePieces("W");
    
    renderBoard(boardState);
}

init();
