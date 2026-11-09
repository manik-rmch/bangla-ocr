/**
 * Document Editor Module (Phase 10 & 11 UI Integration)
 * পুনর্গঠিত ডকুমেন্ট এডিটর এবং এক্সপোর্ট বার রেন্ডারার।
 */
import { DocxExport } from '../export/docx-export.js';
import { XlsxExport } from '../export/xlsx-export.js';
import { CsvExport } from '../export/csv-export.js';
import { PdfExport } from '../export/pdf-export.js';
import { ZipExport } from '../export/zip-export.js';

export class DocumentEditor {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.documentData = null;
    }

    loadDocument(documentData) {
        this.documentData = documentData;
        this.render();
    }

    render() {
        if (!this.container || !this.documentData) return;

        const { metadata, contentTable } = this.documentData;

        let html = `
            <div class="document-editor-wrapper" style="padding: 20px; background: #fff; border: 1px solid #ddd; border-radius: 8px;">
                <!-- Header Control & Export Toolbar -->
                <div class="export-toolbar" style="margin-bottom: 20px; padding: 12px; background: #f8f9fa; border-radius: 6px; border: 1px solid #dee2e6; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                    <strong style="color: #0d6efd; font-size: 16px;">📥 এক্সপোর্ট / ডাউনলোড অপশন:</strong>
                    <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                        <button id="btn-export-pdf" style="background: #dc3545; color: #fff; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer;">📄 PDF</button>
                        <button id="btn-export-docx" style="background: #0d6efd; color: #fff; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer;">📝 DOCX</button>
                        <button id="btn-export-xlsx" style="background: #198754; color: #fff; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer;">📊 XLSX</button>
                        <button id="btn-export-csv" style="background: #0dcaf0; color: #000; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer;">📑 CSV</button>
                        <button id="btn-export-zip" style="background: #6c757d; color: #fff; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer;">📦 ZIP</button>
                    </div>
                </div>

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

                <!-- Instructions & Signatures -->
                <div class="editor-instructions" style="margin-bottom: 20px;">
                    <ul style="list-style-type: square; padding-left: 20px;">
        `;
        metadata.headerSections.forEach(info => {
            html += `<li contenteditable="true" style="margin-bottom: 5px;">${info}</li>`;
        });

        html += `
                    </ul>
                </div>

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

        // Attach Export Event Listeners
        this.container.querySelector('#btn-export-pdf')?.addEventListener('click', () => PdfExport.export(this.documentData));
        this.container.querySelector('#btn-export-docx')?.addEventListener('click', () => DocxExport.export(this.documentData));
        this.container.querySelector('#btn-export-xlsx')?.addEventListener('click', () => XlsxExport.export(this.documentData));
        this.container.querySelector('#btn-export-csv')?.addEventListener('click', () => CsvExport.export(this.documentData));
        this.container.querySelector('#btn-export-zip')?.addEventListener('click', () => ZipExport.export(this.documentData));
    }

    getUpdatedDocument() {
        return this.documentData;
    }
}
