/**
 * Document Builder Module (Phase 9)
 * লেআউট এবং টেবিল পুনর্গঠন একসাথে যুক্ত করে সম্পূর্ণ ডকুমেন্ট প্রস্তুত করে।
 */
import { LayoutReconstruction } from './layout-reconstruction.js';
import { TableReconstruction } from './table-reconstruction.js';

export class DocumentBuilder {
    static buildCompleteDocument(analysisData, tableBound, ocrResults) {
        const layout = LayoutReconstruction.reconstructLayout(analysisData);
        const table = TableReconstruction.buildTable(tableBound, ocrResults);

        return {
            metadata: layout,
            contentTable: table,
            status: "Reconstructed successfully"
        };
    }
}
