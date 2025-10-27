const SIZE = 8
const INIT = [
    'rnbqkbnr',
    'pppppppp',
    '........',
    '........',
    '........',
    '........',
    'PPPPPPPP',
    'RNBQKBNR'
];

const board = document.getElementById("board");

function toLetter(num) {
    return String.fromCharCode("a".charCodeAt(0) + num);
}

for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
        const square = document.createElement("div");
        const coordinateLabel = document.createElement("p");
        const label = toLetter(col) + (SIZE - row)
        coordinateLabel.textContent = label;
        coordinateLabel.id = label;
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
