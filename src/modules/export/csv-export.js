/**
 * CSV Export Module (Phase 11)
 * বাংলা ইউনিকোড (UTF-8 BOM) সহ CSV ফাইলেই এক্সপোর্ট করে।
 */

export class CsvExport {
    /**
     * টেবিল ডেটাকে CSV হিসেবে ডাউনলোড করা
     * @param {Object} documentData 
     * @param {string} filename 
     */
    static export(documentData, filename = "duty-roster.csv") {
        const { contentTable } = documentData;
        const rowMap = {};
        
        contentTable.cells.forEach(cell => {
            if (!rowMap[cell.row]) rowMap[cell.row] = [];
            rowMap[cell.row][cell.col] = `"${(cell.text || '').replace(/"/g, '""')}"`;
        });

        let csvContent = "\uFEFF"; // UTF-8 BOM for Bangla in Excel
        Object.keys(rowMap).forEach(r => {
            csvContent += rowMap[r].join(",") + "\n";
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}
