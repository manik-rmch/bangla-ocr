/**
 * Document Editor Module (Phase 10)
 * পুনর্গঠিত ডকুমেন্ট ও টেবিল সেলের কন্টেন্ট লাইভ সম্পাদনা করার ব্যবস্থা প্রদান করে।
 */

export class DocumentEditor {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.documentData = null;
    }

    /**
     * এডিটর কন্টেইনারে ডকুমেন্ট লোড করা
     * @param {Object} documentData 
     */
    loadDocument(documentData) {
        this.documentData = documentData;
        this.render();
    }

    /**
     * এডিটেবল ইন্টারফেস রেন্ডার করা
     */
    render() {
        if (!this.container || !this.documentData) return;

        const { metadata, contentTable } = this.documentData;

        let html = `
            <div class="document-editor-wrapper" style="padding: 20px; background: #fff; border: 1px solid #ddd; border-radius: 8px;">
                <!-- Title & Subtitle Editor -->
                <div class="editor-header" style="text-align: center; margin-bottom: 20px;">
                    <h2 contenteditable="true" class="editable-title" style="outline: 1px dashed #2196F3; padding: 4px;">${metadata.title}</h2>
                    <h3 contenteditable="true" class="editable-subtitle" style="outline: 1px dashed #2196F3; padding: 4px;">${metadata.subtitle}</h3>
                </div>

                <!-- Table Editor -->
                <div class="table-editor-container" style="overflow-x: auto; margin-bottom: 20px;">
                    <table class="reconstructed-table" style="width: 100%; border-collapse: collapse; border: 1px solid #000;">
                        <tbody>
        `;

        // সেলগুলো রো অনুযায়ী সাজিয়ে গ্রিড তৈরি
        const rowMap = {};
        contentTable.cells.forEach(cell => {
            if (!rowMap[cell.row]) rowMap[cell.row] = [];
            rowMap[cell.row].push(cell);
        });

        Object.keys(rowMap).forEach(rowIndex => {
            html += `<tr>`;
            rowMap[rowIndex].forEach(cell => {
                html += `
                    <td contenteditable="true" 
                        data-row="${cell.row}" 
                        data-col="${cell.col}"
                        style="border: 1px solid #000; padding: 6px; text-align: center; min-width: 80px; outline: none;">
                        ${cell.text || ''}
                    </td>
                `;
            });
            html += `</tr>`;
        });

        html += `
                        </tbody>
                    </table>
                </div>

                <!-- Header Instructions / Notes -->
                <div class="editor-instructions" style="margin-bottom: 20px;">
                    <ul style="list-style-type: square; padding-left: 20px;">
        `;
        metadata.headerSections.forEach(info => {
            html += `<li contenteditable="true" style="margin-bottom: 5px;">${info}</li>`;
        });

        html += `
                    </ul>
                </div>

                <!-- Signature Section Editor -->
                <div class="editor-signatures" style="display: flex; justify-content: space-between; margin-top: 40px; padding: 0 20px;">
        `;
        metadata.signatureBlocks.forEach(sig => {
            html += `
                <div style="text-align: center;">
                    <p contenteditable="true" style="margin: 0; font-weight: bold;">(${sig.name})</p>
                    <p contenteditable="true" style="margin: 0;">${sig.designation}</p>
                </div>
            `;
        });

        html += `
                </div>
            </div>
        `;

        this.container.innerHTML = html;
        this.bindEvents();
    }

    /**
     * এডিটর ইভেন্টসমূহ হ্যান্ডেল করা
     */
    bindEvents() {
        const editableCells = this.container.querySelectorAll('td[contenteditable="true"]');
        editableCells.forEach(cell => {
            cell.addEventListener('input', (e) => {
                const r = e.target.dataset.row;
                const c = e.target.dataset.col;
                const foundCell = this.documentData.contentTable.cells.find(item => item.row == r && item.col == c);
                if (foundCell) {
                    foundCell.text = e.target.innerText.trim();
                }
            });
        });
    }

    /**
     * এডিটকৃত ডেটা প্রাপ্তি
     */
    getUpdatedDocument() {
        return this.documentData;
    }
}
