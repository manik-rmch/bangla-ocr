/**
 * Table Reconstruction Module (Phase 9)
 * শনাক্তকৃত টেবিল এবং সেলের ভেতর OCR এর ফলাফল নিখুঁতভাবে সন্নিবেশিত করে।
 */
import { CellDetector } from '../table-detection/cell-detector.js';

export class TableReconstruction {
    /**
     * টেবিলের সেলগুলোতে ডেটা ম্যাপ করা
     * @param {Object} tableBound 
     * @param {Array} ocrResults 
     * @returns {Array} পূর্ণাঙ্গ পুনর্গঠিত টেবিল সেল ডেটা
     */
    static buildTable(tableBound, ocrResults = []) {
        const cells = CellDetector.extractCells(tableBound);
        
        // সেলের সাথে OCR ফলাফল যুক্ত করা
        cells.forEach((cell, index) => {
            if (ocrResults[index]) {
                cell.text = ocrResults[index];
            }
        });

        return {
            tableId: tableBound.id,
            rows: tableBound.rows,
            columns: tableBound.columns,
            cells: cells
        };
    }
}
