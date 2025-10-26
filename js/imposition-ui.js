// js/imposition-ui.js
import { maximizeNUp, SHEET_SIZES, INCH_TO_POINTS } from './imposition-logic.js';
import { drawCropMarks, drawSlugInfo } from './imposition-drawing.js';

const IMPOSITION_TYPE_OPTIONS = [
    { value: 'stack', label: 'Stack' },
    { value: 'repeat', label: 'Repeat' },
    { value: 'booklet', label: 'Booklet' },
];

async function getPdfPageDimensions(pdfUrl) {
    const { pdfjsLib } = window;
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://mozilla.github.io/pdf.js/build/pdf.worker.mjs`;
    if (!pdfjsLib) {
        console.error("PDF.js library is not loaded.");
        return null;
    }

    try {
        const loadingTask = pdfjsLib.getDocument(pdfUrl);
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(1);
        const { width, height } = page.getViewport({ scale: 1 });
        return { pdfDoc: pdf, width, height };
    } catch (error) {
        console.error('Error getting PDF dimensions:', error);
        return null;
    }
}

function populateForm(settings) {
    const form = document.getElementById('imposition-form');
    for (const key in settings) {
        const el = form.elements[key];
        if (el) {
            if (el.type === 'checkbox') {
                el.checked = settings[key];
            } else {
                el.value = settings[key];
            }
        }
    }
}

async function renderPreview(settings, pdfDoc) {
    const canvas = document.getElementById('imposition-preview-canvas');
    const ctx = canvas.getContext('2d');

    const sheetConfig = SHEET_SIZES.find(s => s.name === settings.sheet);
    const sheetWidth = sheetConfig.longSideInches * INCH_TO_POINTS;
    const sheetHeight = sheetConfig.shortSideInches * INCH_TO_POINTS;

    // Simple scaling to fit preview area
    const scale = Math.min(canvas.parentElement.clientWidth / sheetWidth, canvas.parentElement.clientHeight / sheetHeight);
    canvas.width = sheetWidth * scale;
    canvas.height = sheetHeight * scale;
    ctx.scale(scale, scale);

    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, sheetWidth, sheetHeight);

    const page = await pdfDoc.getPage(1);
    const pageViewport = page.getViewport({ scale: 1 });
    const pageContentWidth = pageViewport.width;
    const pageContentHeight = pageViewport.height;

    // ... (simplified layout calculation for preview)
    const startX = (sheetWidth - (settings.columns * pageContentWidth)) / 2;
    const startY = (sheetHeight - (settings.rows * pageContentHeight)) / 2;

    for (let row = 0; row < settings.rows; row++) {
        for (let col = 0; col < settings.columns; col++) {
            const x = startX + col * pageContentWidth;
            const y = startY + row * pageContentHeight;

            // This is a simplified preview - just drawing a box for each page
            ctx.strokeStyle = 'gray';
            ctx.lineWidth = 1;
            ctx.strokeRect(x, y, pageContentWidth, pageContentHeight);
            ctx.fillStyle = 'lightgray';
            ctx.fillRect(x, y, pageContentWidth, pageContentHeight);
            ctx.fillStyle = 'black';
            ctx.fillText(`Page ${row * settings.columns + col + 1}`, x + 10, y + 20);
        }
    }
}


export async function initializeImpositionUI(projectData) {
    const imposePdfButton = document.getElementById('impose-pdf-button');
    const impositionModal = document.getElementById('imposition-modal');
    const closeModalButton = document.getElementById('imposition-modal-close-button');
    const form = document.getElementById('imposition-form');

    // Populate dropdowns
    const impTypeSelect = document.getElementById('imposition-type');
    IMPOSITION_TYPE_OPTIONS.forEach(opt => impTypeSelect.add(new Option(opt.label, opt.value)));
    const sheetSelect = document.getElementById('sheet-size');
    SHEET_SIZES.forEach(s => sheetSelect.add(new Option(s.name, s.name)));

    let pdfDoc;

    async function openModal() {
        impositionModal.classList.remove('hidden');

        const latestVersion = projectData.versions[projectData.versions.length - 1];
        if (!latestVersion || !latestVersion.previewURL) {
            alert("No preview PDF found for this project.");
            return;
        }

        const pdfInfo = await getPdfPageDimensions(latestVersion.previewURL);
        if (!pdfInfo) return;
        pdfDoc = pdfInfo.pdfDoc;

        let initialSettings = projectData.impositions?.[projectData.impositions.length - 1]?.settings;
        if (!initialSettings) {
            initialSettings = maximizeNUp(pdfInfo.width, pdfInfo.height);
        }

        if (initialSettings) {
            populateForm(initialSettings);
            renderPreview(initialSettings, pdfDoc);
        }
    }

    form.addEventListener('change', () => {
        const formData = new FormData(form);
        const settings = Object.fromEntries(formData.entries());
        // Coerce numbers
        Object.keys(settings).forEach(key => {
            const el = form.elements[key];
            if (el.type === 'number') settings[key] = parseFloat(settings[key]);
        });
        settings.isDuplex = form.elements.isDuplex.checked;

        if (pdfDoc) {
            renderPreview(settings, pdfDoc);
        }
    });

    closeModalButton.addEventListener('click', () => impositionModal.classList.add('hidden'));
    imposePdfButton.addEventListener('click', openModal);

    // ... (Generate button logic remains the same)
}
