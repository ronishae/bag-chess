const SIZE = 8;
const INIT = [
    ["r", "n", "b", "q", "k", "b", "n", "r"],
    ["p", "p", "p", "p", "p", "p", "p", "p"],
    [".", ".", ".", ".", ".", "B", ".", "."],
    [".", ".", ".", ".", ".", ".", "b", "."],
    [".", ".", ".", "b", ".", ".", "B", "."],
    [".", ".", ".", ".", ".", ".", ".", "."],
    ["P", "P", "P", "P", "P", "P", "P", "P"],
    ["R", "N", "B", "Q", "K", "B", "N", "R"],
];
const boardState = INIT;
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

function isEmptySquare(row, col) {
    return boardState[row][col] === ".";
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
    return moves.map(([r, c]) => toCoordinate(r, c)).join(", ");
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
    if (isInBounds(...target1) && isEmptySquare(...target1)) {
        moves.push(target1);

        // only check two-square move if one-square move is valid
        const target2 = [row + 2 * direction, col];
        if (isInBounds(...target2) && isEmptySquare(...target2)) {
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

function getRookMoves(row, col, pieceType) {
    const moves = [];
    // up, right, down, left
    const directions = [
        [-1, 0],
        [0, 1],
        [1, 0],
        [0, -1],
    ];

    for (const [dx, dy] of directions) {
        var targetRow = row;
        var targetCol = col;
        // go until out of bounds or blocked
        while (isInBounds(targetRow + dx, targetCol + dy)) {
            targetRow += dx;
            targetCol += dy;
            if (isEmptySquare(targetRow, targetCol)) {
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

function getBishopMoves(row, col, pieceType) {
    const moves = [];
    // up-right, down-right, down-left, up-left
    const directions = [
        [-1, 1],
        [1, 1],
        [1, -1],
        [-1, -1],
    ];

    for (const [dx, dy] of directions) {
        var targetRow = row;
        var targetCol = col;
        // go until out of bounds or blocked
        while (isInBounds(targetRow + dx, targetCol + dy)) {
            targetRow += dx;
            targetCol += dy;
            if (isEmptySquare(targetRow, targetCol)) {
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
}

function handlePieceClick(event) {
    const parent = event.target.parentElement;
    const square = parent.parentElement.id;
    const pieceType = pieceFromCoordinate(square);
    console.log(`Piece ${pieceType} clicked at square ${square}`);
    const moves = getPossibleMoves(...fromCoordinate(square), pieceType);
    console.log(convertMoves(moves));
}

function renderBoard(boardState) {
    // clear board to prevent id duplication
    removeElementsByClass("piece-image");

    for (let row = 0; row < SIZE; row++) {
        for (let col = 0; col < SIZE; col++) {
            const square = document.getElementById(toCoordinate(row, col));
            if (boardState[row][col] !== ".") {
                const button = document.createElement("button");
                button.classList.add("piece-button");
                button.addEventListener("click", handlePieceClick);

                const piece = document.createElement("img");
                button.appendChild(piece);

                piece.classList.add("piece-image");
                const id = boardState[row][col];
                if (id === id.toUpperCase()) {
                    piece.src = `pieces/${id.toLowerCase()}.png`;
                } else {
                    piece.src = `pieces/b${id.toLowerCase()}.png`;
                }
                square.appendChild(button);
            }
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
