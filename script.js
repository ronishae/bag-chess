const SIZE = 8;
const INIT = [
    "rnbqkbnr",
    "pppppppp",
    "........",
    "........",
    "........",
    "........",
    "PPPPPPPP",
    "RNBQKBNR",
];

const board = document.getElementById("board");
const boardState = INIT;

function toLetter(num) {
    return String.fromCharCode("a".charCodeAt(0) + num);
}

function toCoordinate(row, col) {
    return toLetter(col) + (SIZE - row);
}

function removeElementsByClass(className) {
    // 1. Select all matching elements
    const elements = document.querySelectorAll(`.${className}`);

    // 2. Iterate and remove each element
    // Note: The NodeList returned by querySelectorAll is static, so removing elements 
    // while iterating is safe.
    elements.forEach(element => {
        element.remove();
    });
}

function renderBoard() {
    removeElementsByClass("piece-image");

    for (let row = 0; row < SIZE; row++) {
        for (let col = 0; col < SIZE; col++) {
            const square = document.getElementById(toCoordinate(row, col));
            if (boardState[row].charAt(col) !== ".") {
                const piece = document.createElement("img");
                piece.classList.add("piece-image");
                const id = boardState[row].charAt(col);
                if (id === id.toUpperCase()) {
                    piece.src = `pieces/${id.toLowerCase()}.png`;
                } else {
                    piece.src = `pieces/b${id.toLowerCase()}.png`;
                }
                square.appendChild(piece);
            }
        }
    }
}

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

renderBoard();
