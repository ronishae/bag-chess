const SIZE = 8;
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
const boardState = INIT;
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

var turn = "W"; // 'W' for White's turn, 'B' for Black

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
// TODO: still unsure on the exact moves I want
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
    if (turn === "W") {
        if (hasSpaceToQueensideCastle(whiteQueenSidePossible, row, col)) moves.push([row, col - 2]);
        if (hasSpaceToKingsideCastle(whiteKingSidePossible, row, col)) moves.push([row, col + 2]);
    }
    else {
        if (hasSpaceToQueensideCastle(blackQueenSidePossible, row, col)) moves.push([row, col - 2]);
        if (hasSpaceToKingsideCastle(blackKingSidePossible, row, col)) moves.push([row, col + 2]);
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


function updateBoard(
    board,
    pieceType,
    startRow,
    startCol,
    targetRow,
    targetCol
) {
    board[startRow][startCol] = ".";
    board[targetRow][targetCol] = pieceType;

    const targetCoordinate = toCoordinate(targetRow, targetCol);
    const WHITEROW = 7;
    const BLACKROW = 0;
    const QUEENSIDE = 3;
    const KINGSIDE = 5;
    const QUEENSIDEROOK = 0;
    const KINGSIDEROOK = 7;
    // this is a castle since king moves 2 squares, need to additionally move the rook
    if (pieceType.toLowerCase() === "k" && Math.abs(startCol - targetCol) == 2) {
        if (targetCoordinate === "c1") {
            board[WHITEROW][QUEENSIDEROOK] = ".";
            board[WHITEROW][QUEENSIDE] = "R";
        }
        else if (targetCoordinate === "g1") {
            board[WHITEROW][KINGSIDEROOK] = ".";
            board[WHITEROW][KINGSIDE] = "R";
        }
        else if (targetCoordinate === "c8") {
            board[BLACKROW][QUEENSIDEROOK] = ".";
            board[BLACKROW][QUEENSIDE] = "r";
        }
        else if (targetCoordinate === "g8") {
            board[BLACKROW][KINGSIDEROOK] = ".";
            board[BLACKROW][KINGSIDE] = "r";
        }
    }
    
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
        if (pieceType.toLowerCase() === "k" && Math.abs(startCol - col) == 2) {
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

    // checkmate
    if (!legalMoveExists) {
        console.log("Checkmate! Game Over.");
        // TODO: disable buttons and implement end of game
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


function updateCastlingStateAfterMove(pieceType, startingSquare, endingSquare) {
    // one of the involved pieces moves
    if (pieceType === "K") {
        whiteKingSidePossible = false;
        whiteQueenSidePossible = false;
    } else if (pieceType === "k") {
        blackKingSidePossible = false;
        blackQueenSidePossible;
    } else if (pieceType === "R") {
        if (startingSquare === "a1") {
            whiteQueenSidePossible = false;
        } else if (startingSquare === "h1") {
            whiteKingSidePossible = false;
        }
    } else if (pieceType === "r") {
        if (startingSquare === "a8") {
            blackQueenSidePossible = false;
        } else if (startingSquare === "h8") {
            blackKingSidePossible = false;
        }
    }

    // square is the ending location, so if it ends on one of the rook locations
    // the rook must have been captured
    if (endingSquare === "a1") {
        whiteQueenSidePossible = false;
    } else if (endingSquare === "h1") {
        whiteKingSidePossible = false;
    } else if (endingSquare === "a8") {
        blackQueenSidePossible = false;
    } else if (endingSquare === "h8") {
        blackKingSidePossible = false;
    }
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

// Cannot move pawns.
// this might move a king into check or cause a check state, so flag moves should be validated first
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
            updateBoard(board, passengerPiece, ...passengerSquare, ...passengerTargetSquare);
        }
    }
}

function makeMove(pieceType, startRow, startCol, event) {
    const parent = event.target.parentElement;
    const startingSquare = toCoordinate(startRow, startCol);
    const endingSquare = parent.id;
    const [endRow, endCol] = fromCoordinate(endingSquare);

    updateCastlingStateAfterMove(pieceType, startingSquare, endingSquare);
    
    updateBoard(boardState, pieceType, startRow, startCol, endRow, endCol);
    // handle flag move specifically
    // move passenger after moving the piece so it is allowed to move into the flag piece's old spot
    if (pieceType.toLowerCase() === "f") {
        tryMoveFlagPassenger(boardState, pieceType, startRow, startCol, endRow, endCol);
    }

    if (turn === "W") {
        var bagToUse = whiteBag;
        var bagToUnhighlight = document.getElementById("white-bag");
        var bagToHighlight = document.getElementById("black-bag");
    } else {
        bagToUse = blackBag;
        var bagToUnhighlight = document.getElementById("black-bag");
        var bagToHighlight = document.getElementById("white-bag");
    }
    bagToUse.delete(pieceType.toLowerCase());

    if (bagHasNoMoves(bagToUse)) {
        // need to duplicate this check since JS can't dereference pointers to actually update the real bag
        // using the bagToUse variable
        if (turn === "W") {
            whiteBag = new Set([...pieceList]);
        } else {
            blackBag = new Set([...pieceList]);
        }
        console.log("Reset Bag!");
    }

    renderBags();
    bagToHighlight.classList.add("green-background");
    bagToUnhighlight.classList.remove("green-background");

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
    removeElementsByClass("check-indicator");
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

function renderBoard(board, check, checkedRow, checkedCol) {
    // clear board to prevent id duplication
    removeElementsByClass("piece-image");
    removeElementsByClass("piece-button");

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
    renderBoard(INIT);
}

init();
