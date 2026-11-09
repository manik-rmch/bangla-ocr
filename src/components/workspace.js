/**
 * Workspace Component (Phase 11 - UI Update)
 * Document OCR এবং Text OCR-এর ফলাফল প্রদর্শন ও এক্সপোর্ট বাটন অ্যাকশন হ্যান্ডেল করে।
 */
import { DocxExport } from '../modules/export/docx-export.js';
import { XlsxExport } from '../modules/export/xlsx-export.js';
import { CsvExport } from '../modules/export/csv-export.js';
import { PdfExport } from '../modules/export/pdf-export.js';
import { ZipExport } from '../modules/export/zip-export.js';

export class Workspace {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.currentDocumentData = null;
    }

    setDocumentData(data) {
        this.currentDocumentData = data;
        this.renderExportToolbar();
    }

    renderExportToolbar() {
        const toolbarHtml = `
            <div class="export-toolbar" style="margin-top: 20px; padding: 15px; background: #eef4fb; border-radius: 8px; border: 1px solid #b6d4fe;">
                <h4 style="margin: 0 0 10px 0; color: #0d6efd;">📥 এক্সপোর্ট / ডাউনলোড সেকশন:</h4>
                <div class="export-buttons-group" style="display: flex; gap: 10px; flex-wrap: wrap;">
                    <button id="btn-export-pdf" class="btn btn-pdf" style="background: #dc3545; color: white; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer; font-weight: bold;">📄 PDF এক্সপোর্ট</button>
                    <button id="btn-export-docx" class="btn btn-docx" style="background: #0d6efd; color: white; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer; font-weight: bold;">📝 DOCX (Word)</button>
                    <button id="btn-export-xlsx" class="btn btn-xlsx" style="background: #198754; color: white; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer; font-weight: bold;">📊 XLSX (Excel)</button>
                    <button id="btn-export-csv" class="btn btn-csv" style="background: #0dcaf0; color: black; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer; font-weight: bold;">📑 CSV</button>
                    <button id="btn-export-zip" class="btn btn-zip" style="background: #6c757d; color: white; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer; font-weight: bold;">📦 ZIP অল-ইন-ওয়ান</button>
                </div>
            </div>
        `;
        
        let toolbarContainer = document.getElementById('export-toolbar-container');
        if (!toolbarContainer) {
            toolbarContainer = document.createElement('div');
            toolbarContainer.id = 'export-toolbar-container';
            this.container.appendChild(toolbarContainer);
        }
        toolbarContainer.innerHTML = toolbarHtml;

        this.bindExportEvents();
    }

    bindExportEvents() {
        document.getElementById('btn-export-pdf')?.addEventListener('click', () => {
            PdfExport.export(this.currentDocumentData);
        });

        document.getElementById('btn-export-docx')?.addEventListener('click', () => {
            DocxExport.export(this.currentDocumentData);
        });

        document.getElementById('btn-export-xlsx')?.addEventListener('click', () => {
            XlsxExport.export(this.currentDocumentData);
        });

        document.getElementById('btn-export-csv')?.addEventListener('click', () => {
            CsvExport.export(this.currentDocumentData);
        });

        document.getElementById('btn-export-zip')?.addEventListener('click', () => {
            ZipExport.export(this.currentDocumentData);
        });
    }
}
