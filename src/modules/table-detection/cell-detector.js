/**
 * Cell Detector Module (Phase 8)
 * রো এবং কলাম ইন্টারসেকশন থেকে প্রতিটি সেল (Cell Bounding Box) তৈরি করে।
 */
import { RowColumnDetector } from './row-column-detector.js';

export class CellDetector {
    static extractCells(tableBound) {
        const { rows, columns } = RowColumnDetector.detect(tableBound);
        const cells = [];

        rows.forEach((row, rIndex) => {
            columns.forEach((col, cIndex) => {
                cells.push({
                    row: rIndex,
                    col: cIndex,
                    x: col.x,
                    y: row.y,
                    width: col.width,
                    height: row.height,
                    text: ''
                });
            });
        });

        return cells;
    }
}
