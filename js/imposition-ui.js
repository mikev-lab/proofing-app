// js/imposition-ui.js
import { maximizeNUp, SHEET_SIZES } from './imposition-logic.js';
import { drawCropMarks, drawSlugInfo, drawSpineIndicator, drawSpineSlugText } from './imposition-drawing.js';
import { INCH_TO_POINTS } from './constants.js';

// Dynamically load QRious library
function loadQRiousScript() {
    return new Promise((resolve, reject) => {
        if (window.QRious) {
            resolve();
            return;
        }
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrious/4.0.2/qrious.min.js';
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}


const IMPOSITION_TYPE_OPTIONS = [
    { value: 'stack', label: 'Stack' },
    { value: 'repeat', label: 'Repeat' },
    { value: 'booklet', label: 'Booklet' },
    { value: 'collateCut', label: 'Collate & Cut' }
];

async function getPdfDoc(pdfUrl) {
    const { pdfjsLib } = window;
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://mozilla.github.io/pdf.js/build/pdf.worker.mjs`;
    if (!pdfjsLib) {
        console.error("PDF.js library is not loaded.");
        return null;
    }
    try {
        const loadingTask = pdfjsLib.getDocument(pdfUrl);
        return await loadingTask.promise;
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

async function renderPreview(settings, pdfDoc, projectData) {
    const canvas = document.getElementById('imposition-preview-canvas');
    const ctx = canvas.getContext('2d');

    const sheetConfig = SHEET_SIZES.find(s => s.name === settings.sheet);
    const sheetWidth = sheetConfig.longSideInches * INCH_TO_POINTS;
    const sheetHeight = sheetConfig.shortSideInches * INCH_TO_POINTS;
    const bleedPoints = (settings.bleedInches || 0) * INCH_TO_POINTS;

    const scale = Math.min((canvas.parentElement.clientWidth-20) / sheetWidth, (canvas.parentElement.clientHeight-20) / sheetHeight);
    canvas.width = sheetWidth * scale;
    canvas.height = sheetHeight * scale;

    ctx.save();
    ctx.scale(scale, scale);

    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, sheetWidth, sheetHeight);

    const firstPage = await pdfDoc.getPage(1);
    const pageViewport = firstPage.getViewport({ scale: 1 });
    const pageContentWidth = pageViewport.width;
    const pageContentHeight = pageViewport.height;

    const totalRequiredWidth = (pageContentWidth * settings.columns) + (Math.max(0, settings.columns - 1) * (settings.horizontalGutterInches * INCH_TO_POINTS));
    const totalRequiredHeight = (pageContentHeight * settings.rows) + (Math.max(0, settings.rows - 1) * (settings.verticalGutterInches * INCH_TO_POINTS));
    const startX = (sheetWidth - totalRequiredWidth) / 2;
    const startY = (sheetHeight - totalRequiredHeight) / 2;

    for (let row = 0; row < settings.rows; row++) {
        for (let col = 0; col < settings.columns; col++) {
            const slotIndex = row * settings.columns + col;
            const pageNum = (settings.impositionType === 'repeat') ? 1 : slotIndex + 1;
            if (pageNum > pdfDoc.numPages) continue;

            const page = await pdfDoc.getPage(pageNum);
            const x = startX + col * (pageContentWidth + (settings.horizontalGutterInches * INCH_TO_POINTS));
            const y = startY + row * (pageContentHeight + (settings.verticalGutterInches * INCH_TO_POINTS));

            const tempCanvas = document.createElement('canvas');
            const tempCtx = tempCanvas.getContext('2d');
            tempCanvas.width = pageContentWidth;
            tempCanvas.height = pageContentHeight;

            await page.render({ canvasContext: tempCtx, viewport: pageViewport }).promise;

            ctx.drawImage(tempCanvas, x, y);

            const trimAreaX = x + bleedPoints;
            const trimAreaY = y + bleedPoints;
            const trimAreaWidth = pageContentWidth - (2 * bleedPoints);
            const trimAreaHeight = pageContentHeight - (2 * bleedPoints);

            drawCropMarks(ctx, trimAreaX, trimAreaY, trimAreaWidth, trimAreaHeight, {
                hasTopNeighbor: row > 0,
                hasBottomNeighbor: row < settings.rows - 1,
                hasLeftNeighbor: col > 0,
                hasRightNeighbor: col < settings.columns - 1
            });
            if(settings.showSpineMarks){
                 drawSpineSlugText(ctx, trimAreaX, trimAreaY, trimAreaWidth, trimAreaHeight, true, true, bleedPoints);
                 drawSpineIndicator(ctx, trimAreaX, trimAreaY, trimAreaWidth, trimAreaHeight, true);
            }
        }
    }
    await drawSlugInfo(ctx, "1F", 1, projectData);
    ctx.restore();
}

export async function initializeImpositionUI(projectData) {
    const imposePdfButton = document.getElementById('impose-pdf-button');
    if (!projectData.versions || projectData.versions.length === 0) {
        imposePdfButton.style.display = 'none';
        return;
    }
     imposePdfButton.style.display = 'inline-block';

    await loadQRiousScript();

    const impositionModal = document.getElementById('imposition-modal');
    const closeModalButton = document.getElementById('imposition-modal-close-button');
    const form = document.getElementById('imposition-form');

    const impTypeSelect = document.getElementById('imposition-type');
    impTypeSelect.innerHTML = '';
    IMPOSITION_TYPE_OPTIONS.forEach(opt => impTypeSelect.add(new Option(opt.label, opt.value)));

    const sheetSelect = document.getElementById('sheet-size');
    sheetSelect.innerHTML = '';
    SHEET_SIZES.forEach(s => sheetSelect.add(new Option(s.name, s.name)));

    // Add checkbox for spine marks
    if (!document.getElementById('show-spine-marks')) {
        const duplexContainer = document.getElementById('is-duplex').parentElement;
        duplexContainer.insertAdjacentHTML('afterend', `
            <div class="pt-4 border-t border-slate-700/50">
                <label class="flex items-center">
                    <input type="checkbox" id="show-spine-marks" name="showSpineMarks" class="h-4 w-4 rounded border-gray-300 text-indigo-600 bg-white/10">
                    <span class="ml-2 text-gray-300">Show Spine Marks</span>
                </label>
            </div>
        `);
    }


    let pdfDoc;

    const updatePreview = () => {
        const formData = new FormData(form);
        const settings = Object.fromEntries(formData.entries());
        Object.keys(settings).forEach(key => {
            const el = form.elements[key];
            if(el.type === 'number') settings[key] = parseFloat(settings[key]);
            if(el.type === 'checkbox') settings[key] = el.checked;
        });

        if (pdfDoc) {
            renderPreview(settings, pdfDoc, projectData);
        }
    };

    async function openModal() {
        impositionModal.classList.remove('hidden');

        const latestVersion = projectData.versions.slice().sort((a, b) => b.version - a.version)[0];
        const pdfUrl = latestVersion.previewURL || latestVersion.fileURL;
        if (!pdfUrl) {
            alert("No PDF found for this project version.");
            return;
        }

        pdfDoc = await getPdfDoc(pdfUrl);
        if (!pdfDoc) return;

        const firstPage = await pdfDoc.getPage(1);
        const { width, height } = firstPage.getViewport({scale: 1});

        let initialSettings = projectData.impositions?.slice().sort((a,b) => b.createdAt - a.createdAt)[0]?.settings;
        if (!initialSettings) {
            initialSettings = maximizeNUp(width, height);
        }

        if (initialSettings) {
            populateForm(initialSettings);
            updatePreview();
        }
    }

    form.addEventListener('change', updatePreview);
    closeModalButton.addEventListener('click', () => impositionModal.classList.add('hidden'));
    imposePdfButton.addEventListener('click', openModal);
}
