/**
 * Row and Column Detector Module (Phase 8)
 * টেবিলের ভেতরকার রো এবং কলামগুলোর পজিশন ও উচ্চতা/প্রস্থ হিসাব করে।
 */

export class RowColumnDetector {
    /**
     * টেবিলের ভেতরে রো এবং কলাম ডিটেক্ট করা
     * @param {Object} tableBound 
     * @returns {Object} rows এবং columns এর অ্যারে
     */
    static detect(tableBound) {
        const { width, height, rows, columns, x, y } = tableBound;
        
        const rowHeight = height / rows;
        const colWidth = width / columns;

        const rowList = [];
        for (let i = 0; i < rows; i++) {
            rowList.push({
                index: i,
                y: y + (i * rowHeight),
                height: rowHeight
            });
        }

        const colList = [];
        for (let j = 0; j < columns; j++) {
            colList.push({
                index: j,
                x: x + (j * colWidth),
                width: colWidth
            });
        }

        return { rows: rowList, columns: colList };
    }
}
