const SIZE = 8;
const INIT = [
    ["r", "n", "b", "q", "k", "b", "n", "r"],
    ["p", "p", "p", "p", "p", "p", "p", "p"],
    [".", ".", ".", ".", ".", ".", ".", "."],
    [".", ".", ".", ".", ".", ".", ".", "."],
    [".", ".", ".", ".", ".", ".", ".", "."],
    [".", ".", ".", ".", ".", ".", ".", "."],
    ["P", "P", "P", "P", "P", "P", "P", "P"],
    ["R", "N", "B", "Q", "K", "B", "N", "R"],
];
const boardState = INIT;
var turn = "W"; // 'W' for White's turn, 'B' for Black

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

// all the get move functions still need to be validated for checks, pins, can't capture king
function getPawnMoves(row, col, pieceType) {
    var canMoveTwo = false;
    if (pawnOnStartingRow(row, pieceType)) {
        canMoveTwo = true;
    }
    // skip en passant
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
        if (canMoveTwo && isInBounds(...target2) && isEmptySquare(boardState, ...target2)) {
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

    return getSetDistanceMoves(row, col, directions, pieceType);
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

function updateBoard(board, pieceType, startRow, startCol, targetRow, targetCol) {
    board[startRow][startCol] = ".";
    board[targetRow][targetCol] = pieceType;
}

// will need to handle castling specifically later
function getLegalMoves(startRow, startCol, pieceType, moves) {
    // for a move to be legal, your king cannot be in check next turn
    // (whether or not you were put in check, or if the move is putting yourself in check)
    return moves.filter(([row, col]) => {
        const hypotheticalBoard = structuredClone(boardState);
        updateBoard(hypotheticalBoard, pieceType, startRow, startCol, row, col);
        if (isInCheck(hypotheticalBoard, turn)) {
            return false;
        }
        return true;
    });
}

function detectCheckmate() {
    const inCheck = isInCheck(boardState, turn);
    // must be in check to be checkmate
    if (!inCheck) {
        return;
    }

    // iterate through all pieces of the current player and look for legal moves.
    let legalMoveExists = false;

    for (let row = 0; row < SIZE; row++) {
        for (let col = 0; col < SIZE; col++) {
            const pieceType = boardState[row][col];
            if (pieceType === ".") continue;

            const isMyPiece =
                (turn === "W" && !isBlackPiece(pieceType)) ||
                (turn === "B" && isBlackPiece(pieceType));

            if (isMyPiece) {
                const possibleMoves = getPossibleMoves(row, col, pieceType);

                // find moves that do not leave king in check
                const legalMoves = getLegalMoves(row, col, pieceType, possibleMoves);

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

    // checkmate
    if (!legalMoveExists) {
        console.log("Checkmate! Game Over.");
        // TODO: disable buttons and implement end of game
    }
}

function makeMove(pieceType, startRow, startCol, event) {
    const parent = event.target.parentElement;
    const square = parent.id;
    const [row, col] = fromCoordinate(square);
    
    updateBoard(boardState, pieceType, startRow, startCol, row, col);

    if (turn === "W") {
        turn = "B";
    } else {
        turn = "W";
    }
    const inCheck = isInCheck(boardState, turn);
    const [kingRow, kingCol] = locateKing(boardState, turn);
    clearIndicators();
    renderBoard(boardState, inCheck, kingRow, kingCol);
    detectCheckmate();
}

function clearIndicators() {
    removeElementsByClass("check-indicator")
    removeElementsByClass("move-indicator");
    removeElementsByClass("capture-indicator");
}

// pieceType is the piece being moved
function renderMoves(pieceType, startRow, startCol, moves) {
    clearIndicators();

    for (const coordinate of moves) {
        const [row, col] = fromCoordinate(coordinate);
        const square = document.getElementById(coordinate);

        const indicator = document.createElement("button");
        indicator.addEventListener("click", (event) => {
            makeMove(pieceType, startRow, startCol, event);
        });
        indicator.classList.add("move-button");

        // guaranteed it is an opponent piece (via the getPossibleMoves call) if not empty square
        if (boardState[row][col] !== ".") {
            indicator.classList.add("capture-indicator");
        } else {
            indicator.classList.add("move-indicator");
        }
        square.appendChild(indicator);
    }
}

function handlePieceClick(event) {
    const parent = event.target.parentElement;
    const square = parent.parentElement.id;
    const pieceType = pieceFromCoordinate(square);

    const moves = getLegalMoves(...fromCoordinate(square), pieceType, getPossibleMoves(...fromCoordinate(square), pieceType));
    renderMoves(pieceType, ...fromCoordinate(square), convertMoves(moves));
}

function renderBoard(board, check, checkedRow, checkedCol) {
    // clear board to prevent id duplication
    removeElementsByClass("piece-image");

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
            }
            // TODO: disable / hide button and change cursor otherwise

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
            const id = board[row][col];
            if (id === id.toUpperCase()) {
                piece.src = `pieces/${id.toLowerCase()}.png`;
            } else {
                piece.src = `pieces/b${id.toLowerCase()}.png`;
            }

            // put button in square
            square.appendChild(button);
        }
    }
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
    renderBoard(INIT);
}

init();
