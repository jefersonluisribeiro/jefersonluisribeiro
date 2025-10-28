// Estado da aplicação
const PX_PER_MM = 3.78;
const HISTORY_LIMIT = 6;

const state = {
    currentTool: 'select',
    currentSide: 'front',
    cardConfig: {
        width: 88,
        height: 63,
    rounded: false,
    borderRadius: 3,
},
zoomLevel: 1,
labelsVisible: true,
bleedVisible: true,
canvases: {
    front: null,
    back: null
},
layers: {
    front: [],
    back: []
},
selectedObjects: [],
groups: {},
isPanning: false,
panStartX: 0,
panStartY: 0,
containerStartX: 0,
containerStartY: 0,
panMode: false,
zoomPoint: { x: 0, y: 0 },
sizeUnit: 'px',
keepAspectRatio: false,
aspectRatio: 1,
history: {
    past: [],
    future: [],
    limit: HISTORY_LIMIT,
    applying: false,
    debounce: null
}
    panMode: false,
    zoomPoint: { x: 0, y: 0 },
    sizeUnit: 'px',
    keepAspectRatio: false,
    aspectRatio: 1
};

// Elementos DOM
const frontCanvas = document.getElementById('front-canvas');
const backCanvas = document.getElementById('back-canvas');
const frontCanvasWrapper = document.getElementById('front-canvas-wrapper');
const backCanvasWrapper = document.getElementById('back-canvas-wrapper');
const canvasContainer = document.getElementById('canvas-container');
const workspaceArea = document.getElementById('workspace-area');
const zoomLevel = document.getElementById('zoom-level');
const hideLabelsBtn = document.getElementById('hide-labels-btn');
const hideBleedBtn = document.getElementById('hide-bleed-btn');
const panToolBtn = document.getElementById('pan-tool-btn');
const frontBleed = document.getElementById('front-bleed');
const backBleed = document.getElementById('back-bleed');
const imageUpload = document.getElementById('image-upload');
const svgUpload = document.getElementById('svg-upload');
const backgroundImageInput = document.getElementById('background-image');
const borderRadiusControl = document.getElementById('border-radius-control');
const layerListFront = document.getElementById('layer-list-front');
const layerListBack = document.getElementById('layer-list-back');
const propertiesPanel = document.getElementById('properties-panel');
// QR CODE
const qrcodeModal = document.getElementById('qrcode-modal');
const closeModal = document.querySelector('#qrcode-modal .close');
const generateQRCodeBtn = document.getElementById('generate-qrcode');

let sizeUnitSelect = null;
let aspectLockBtn = null;

// Inicialização
document.addEventListener('DOMContentLoaded', function() {
    initializeFabricCanvases();
    setupEventListeners();
    initializeSizeControls();
    updateZoomDisplay();
    updateBleedLines();
    updateCanvasSize();
    centerCanvasContainer();
    loadFromSessionStorage();

// Inicializar o controle de bordas arredondadas
const roundedSelect = document.getElementById('card-rounded');
if (roundedSelect.value === 'yes') {
    borderRadiusControl.classList.add('active');
}
});

function createHistorySnapshot() {
    if (!state.canvases.front || !state.canvases.back) {
        return null;
    }

    const snapshot = {
        front: state.canvases.front.toJSON(['name', 'layerId', 'groupId', 'rx', 'ry']),
        back: state.canvases.back.toJSON(['name', 'layerId', 'groupId', 'rx', 'ry']),
        cardConfig: { ...state.cardConfig }
    };

    return JSON.stringify(snapshot);
}

function setInitialHistorySnapshot() {
    const snapshot = createHistorySnapshot();
    if (!snapshot) {
        return;
    }

    state.history.past = [snapshot];
    state.history.future = [];
}

function recordHistorySnapshot() {
    if (state.history.applying) {
        return;
    }

    const snapshot = createHistorySnapshot();
    if (!snapshot) {
        return;
    }

    const past = state.history.past;
    const last = past[past.length - 1];

    if (last === snapshot) {
        return;
    }

    past.push(snapshot);

    if (past.length > state.history.limit) {
        past.splice(0, past.length - state.history.limit);
    }

    state.history.future = [];
}

function scheduleHistorySnapshot() {
    if (state.history.applying) {
        return;
    }

    if (state.history.debounce) {
        clearTimeout(state.history.debounce);
    }

    state.history.debounce = setTimeout(() => {
        state.history.debounce = null;
        recordHistorySnapshot();
    }, 200);
}

function loadCanvasFromSnapshot(canvas, data) {
    return new Promise(resolve => {
        canvas.loadFromJSON(data, () => {
            canvas.renderAll();
            resolve();
        });
    });
}

async function applyHistorySnapshot(snapshotString) {
    if (!snapshotString) {
        return;
    }

    let snapshot;

    try {
        snapshot = JSON.parse(snapshotString);
    } catch (error) {
        console.error('Não foi possível aplicar o histórico', error);
        return;
    }

    state.history.applying = true;

    if (state.history.debounce) {
        clearTimeout(state.history.debounce);
        state.history.debounce = null;
    }

    try {
        if (snapshot.cardConfig) {
            state.cardConfig = { ...snapshot.cardConfig };
        }

        document.getElementById('card-width').value = state.cardConfig.width;
        document.getElementById('card-height').value = state.cardConfig.height;
        document.getElementById('card-rounded').value = state.cardConfig.rounded ? 'yes' : 'no';
        document.getElementById('border-radius').value = state.cardConfig.borderRadius || 0;

        if (state.cardConfig.rounded) {
            borderRadiusControl.classList.add('active');
        } else {
            borderRadiusControl.classList.remove('active');
        }

        updateCanvasSize();

        state.layers.front = [];
        state.layers.back = [];

        await Promise.all([
            loadCanvasFromSnapshot(state.canvases.front, snapshot.front),
            loadCanvasFromSnapshot(state.canvases.back, snapshot.back)
        ]);

        state.canvases.front.discardActiveObject();
        state.canvases.back.discardActiveObject();
        state.selectedObjects = [];

        updatePropertiesPanel();
        updateLayersList();
        updateGlobalBackgroundColorInput();
    } catch (error) {
        console.error('Não foi possível aplicar o histórico', error);
    } finally {
        state.history.applying = false;
    }
}

function undo() {
    if (state.history.past.length <= 1) {
        return;
    }

    const current = state.history.past.pop();
    state.history.future.push(current);

    if (state.history.future.length > state.history.limit) {
        state.history.future.splice(0, state.history.future.length - state.history.limit);
    }

    const previous = state.history.past[state.history.past.length - 1];
    applyHistorySnapshot(previous);
}

function redo() {
    if (state.history.future.length === 0) {
        return;
    }

    const snapshot = state.history.future.pop();
    state.history.past.push(snapshot);

    if (state.history.past.length > state.history.limit) {
        state.history.past.splice(0, state.history.past.length - state.history.limit);
    }

    applyHistorySnapshot(snapshot);
}

// Configurar os ouvintes de eventos
function setupEventListeners() {
// Ferramentas
document.getElementById('select-tool').addEventListener('click', () => setTool('select'));
document.getElementById('text-tool').addEventListener('click', () => setTool('text'));
document.getElementById('image-tool').addEventListener('click', () => imageUpload.click());
document.getElementById('svg-tool').addEventListener('click', () => svgUpload.click());
document.getElementById('rectangle-tool').addEventListener('click', () => setTool('rectangle'));
document.getElementById('circle-tool').addEventListener('click', () => setTool('circle'));
document.getElementById('duplicate-tool').addEventListener('click', duplicateSelectedObjects);
document.getElementById('group-tool').addEventListener('click', groupSelectedObjects);
document.getElementById('ungroup-tool').addEventListener('click', ungroupSelectedObjects);
document.getElementById('delete-tool').addEventListener('click', deleteSelectedObjects);
document.getElementById('bring-to-front-tool').addEventListener('click', bringToFront);
document.getElementById('send-to-back-tool').addEventListener('click', sendToBack);
document.getElementById('shape-rx').addEventListener('input', updateShapeStyle);
document.getElementById('qrcode-tool').addEventListener('click', openQRCodeModal);

// Upload de imagem
imageUpload.addEventListener('change', handleImageUpload);

// Upload de SVG
svgUpload.addEventListener('change', handleSVGUpload);

// Configuração do cartão
document.getElementById('apply-card-config').addEventListener('click', applyCardConfig);
document.getElementById('card-rounded').addEventListener('change', function() {
    if (this.value === 'yes') {
        borderRadiusControl.classList.add('active');
    } else {
        borderRadiusControl.classList.remove('active');
    }
});

// QR CODE
document.getElementById('qrcode-tool').addEventListener('click', openQRCodeModal);
closeModal.addEventListener('click', closeQRCodeModal);
generateQRCodeBtn.addEventListener('click', generateQRCode);

// E também fechar o modal clicando fora dele
window.addEventListener('click', (event) => {
    if (event.target === qrcodeModal) {
        closeQRCodeModal();
    }
});

function openQRCodeModal() {
    qrcodeModal.style.display = 'block';
}

function closeQRCodeModal() {
    qrcodeModal.style.display = 'none';
    // Voltar para a ferramenta de seleção após fechar o modal
    setTool('select');
}

function generateQRCode() {
    const type = document.getElementById('qrcode-type').value;
    let content = document.getElementById('qrcode-content').value.trim();
    
    if (!content) {
        alert('Por favor, insira um conteúdo para o QR Code.');
        return;
    }
    
    // Se for URL, garantir que começa com http:// ou https://
    if (type === 'url' && !/^https?:\/\//.test(content)) {
        content = 'https://' + content;
    }
    
    // Gerar QR Code
    const qr = qrcode(0, 'M');
    qr.addData(content);
    qr.make();
    
    // Criar uma imagem do QR Code
    const qrImage = qr.createDataURL(4); // 4 é o tamanho do módulo
    
    // Adicionar a imagem ao canvas
    fabric.Image.fromURL(qrImage, (img) => {
        const currentCanvas = state.canvases[state.currentSide];
        
        // Configurar a imagem
        img.set({
            left: 50, // Posição inicial
            top: 50,
            scaleX: 0.5, // Ajuste de escala
            scaleY: 0.5,
            name: 'QR Code',
            type: 'qrcode'
        });
        
        currentCanvas.add(img);
        currentCanvas.setActiveObject(img);
        currentCanvas.renderAll();
        
        updatePropertiesPanel();
        updateLayersList();
    });
    
    // Fechar o modal e limpar o conteúdo
    closeQRCodeModal();
    document.getElementById('qrcode-content').value = '';
    setTool('select');
}

// Tabs do fundo global
document.getElementById('global-background-color').addEventListener('input', applyGlobalBackgroundColor);
document.getElementById('global-background-image').addEventListener('change', applyGlobalBackground);
document.getElementById('apply-global-background').addEventListener('click', applyGlobalBackground);
document.getElementById('remove-global-background').addEventListener('click', removeGlobalBackground);
document.getElementById('background-size').addEventListener('change', updateBackgroundStyle);
document.getElementById('background-position').addEventListener('change', updateBackgroundStyle);

// Salvar automaticamente ao mudar de cor de fundo
function applyGlobalBackgroundColor() {
    const color = document.getElementById('global-background-color').value;
    // Aplica para o lado atual (front/back) baseado no state.currentSide
    const currentCanvas = state.canvases[state.currentSide];
    currentCanvas.backgroundColor = color;
    currentCanvas.renderAll();

    updateGlobalBackgroundColorInput();

    scheduleHistorySnapshot();

    // saveToSessionStorage();
}

function applyGlobalBackground() {
    const file = document.getElementById('global-background-image').files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(event) {
        // Usa o lado atual (front/back) baseado no state.currentSide
        const currentCanvas = state.canvases[state.currentSide];
        const bgSize = document.getElementById('background-size').value;
        const bgPosition = document.getElementById('background-position').value;
        
        fabric.Image.fromURL(event.target.result, function(img) {
            // Configurar a imagem baseada no dimensionamento escolhido
            setupBackgroundImage(img, currentCanvas, bgSize, bgPosition);

            currentCanvas.setBackgroundImage(img, function() {
                currentCanvas.renderAll();
                recordHistorySnapshot();
            });
        });
    };
    reader.readAsDataURL(file);
}

function setupBackgroundImage(img, canvas, bgSize, bgPosition) {
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    const imgWidth = img.width;
    const imgHeight = img.height;
    
    // Resetar transformações
    img.set({
        scaleX: 1,
        scaleY: 1,
        left: 0,
        top: 0,
        originX: 'left',
        originY: 'top'
    });
    
    // Aplicar dimensionamento
    switch(bgSize) {
        case 'cover':
            const scaleX = canvasWidth / imgWidth;
            const scaleY = canvasHeight / imgHeight;
            const scale = Math.max(scaleX, scaleY);
            img.scale(scale);
            break;
            
        case 'contain':
            const containScaleX = canvasWidth / imgWidth;
            const containScaleY = canvasHeight / imgHeight;
            const containScale = Math.min(containScaleX, containScaleY);
            img.scale(containScale);
            break;
            
        case 'original':
            // Mantém o tamanho original
            break;
            
        case 'stretch':
            img.set({
                scaleX: canvasWidth / imgWidth,
                scaleY: canvasHeight / imgHeight
            });
            break;
    }
    
    // Aplicar posicionamento
    const scaledWidth = imgWidth * img.scaleX;
    const scaledHeight = imgHeight * img.scaleY;
    
    switch(bgPosition) {
        case 'center':
            img.set({
                left: (canvasWidth - scaledWidth) / 2,
                top: (canvasHeight - scaledHeight) / 2
            });
            break;
            
        case 'top-left':
            img.set({ left: 0, top: 0 });
            break;
            
        case 'top-center':
            img.set({
                left: (canvasWidth - scaledWidth) / 2,
                top: 0
            });
            break;
            
        case 'top-right':
            img.set({
                left: canvasWidth - scaledWidth,
                top: 0
            });
            break;
            
        case 'center-left':
            img.set({
                left: 0,
                top: (canvasHeight - scaledHeight) / 2
            });
            break;
            
        case 'center-right':
            img.set({
                left: canvasWidth - scaledWidth,
                top: (canvasHeight - scaledHeight) / 2
            });
            break;
            
        case 'bottom-left':
            img.set({
                left: 0,
                top: canvasHeight - scaledHeight
            });
            break;
            
        case 'bottom-center':
            img.set({
                left: (canvasWidth - scaledWidth) / 2,
                top: canvasHeight - scaledHeight
            });
            break;
            
        case 'bottom-right':
            img.set({
                left: canvasWidth - scaledWidth,
                top: canvasHeight - scaledHeight
            });
            break;
    }
    
    // Configurar como não selecionável
    img.set({
        selectable: false,
        evented: false
    });
}

function updateBackgroundStyle() {
    const currentCanvas = state.canvases[state.currentSide];
    const backgroundImage = currentCanvas.backgroundImage;
    
    if (backgroundImage) {
        const bgSize = document.getElementById('background-size').value;
        const bgPosition = document.getElementById('background-position').value;

        setupBackgroundImage(backgroundImage, currentCanvas, bgSize, bgPosition);
        currentCanvas.renderAll();
        scheduleHistorySnapshot();
    }
}

function removeGlobalBackground() {
    // Remove do lado atual (front/back) baseado no state.currentSide
    const currentCanvas = state.canvases[state.currentSide];
    currentCanvas.setBackgroundImage(null, function() {
        currentCanvas.renderAll();
    });
    currentCanvas.backgroundColor = '#ffffff';
    currentCanvas.renderAll();

    recordHistorySnapshot();

    // Atualizar o input de cor para refletir a mudança
    updateGlobalBackgroundColorInput();
}

// Color selector front/back card
function updateGlobalBackgroundColorInput() {
    const currentCanvas = state.canvases[state.currentSide];
    if (currentCanvas) {
        // O Fabric.js armazena a cor de fundo em `backgroundColor`
        let color = currentCanvas.backgroundColor;
        // Se a cor for um objeto (por exemplo, quando é uma cor com alpha), convertemos para string
        if (color && typeof color === 'object') {
            color = color.toHex ? color.toHex() : '#ffffff';
        }
        // Se a cor for undefined ou null, usamos branco
        if (!color) {
            color = '#ffffff';
        }
        // Atualizar o input
        document.getElementById('global-background-color').value = rgbToHex(color);
    }
}

// Customizar shapes
document.getElementById('shape-fill').addEventListener('input', updateShapeStyle);
document.getElementById('shape-stroke').addEventListener('input', updateShapeStyle);
document.getElementById('shape-stroke-width').addEventListener('input', updateShapeStyle);

function updateShapeStyle() {
    if (state.selectedObjects.length === 0) return;
    
    const fill = document.getElementById('shape-fill').value;
    const stroke = document.getElementById('shape-stroke').value;
    const strokeWidth = parseInt(document.getElementById('shape-stroke-width').value);
    const rx = parseInt(document.getElementById('shape-rx').value); // NOVO
    
    state.selectedObjects.forEach(object => {
        if (object.type === 'rect' || object.type === 'rectangle' || object.type === 'circle') {
            object.set({
                fill: fill,
                stroke: stroke,
                strokeWidth: strokeWidth
            });

            // Se for um retângulo, aplicar o raio dos cantos
            if (object.type === 'rect' || object.type === 'rectangle') {
                object.set({
                    rx: rx,
                    ry: rx // Usando o mesmo valor para rx e ry para cantos uniformes
                });
            }
        }
    });

    const currentCanvas = state.canvases[state.currentSide];
    currentCanvas.renderAll();

    scheduleHistorySnapshot();
}

// Tabs de lados
document.querySelectorAll('.side-tab').forEach(tab => {
    tab.addEventListener('click', function() {
        document.querySelectorAll('.side-tab').forEach(t => t.classList.remove('active'));
        this.classList.add('active');
        
        const side = this.dataset.side;
        state.currentSide = side;
        
        if (side === 'front') {
            frontCanvasWrapper.classList.add('active');
            backCanvasWrapper.classList.remove('active');
            layerListFront.classList.remove('hidden');
            layerListBack.classList.add('hidden');
        } else {
            frontCanvasWrapper.classList.remove('active');
            backCanvasWrapper.classList.add('active');
            layerListFront.classList.add('hidden');
            layerListBack.classList.remove('hidden');
        }
        
        updatePropertiesPanel();
        updateLayersList();
        
        // GARANTIR que o color picker atualize imediatamente ao trocar de lado
        updateGlobalBackgroundColorInput();
    });
});

// Tabs de propriedades
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', function() {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        
        this.classList.add('active');
        document.getElementById(`${this.dataset.tab}-tab`).classList.add('active');

        if (this.dataset.tab === 'text') {
            if (state.selectedObjects.length === 0 || 
                (state.selectedObjects[0].type !== 'i-text' && state.selectedObjects[0].type !== 'text')) {
                return; // Não permitir ativar a aba de texto
            }
        }

    });
});

// Controles de propriedades
document.getElementById('pos-x').addEventListener('input', updateObjectPosition);
document.getElementById('pos-y').addEventListener('input', updateObjectPosition);
document.getElementById('width').addEventListener('input', updateObjectSize);
document.getElementById('height').addEventListener('input', updateObjectSize);
document.getElementById('rotation').addEventListener('input', updateObjectRotation);
document.getElementById('opacity').addEventListener('input', updateObjectOpacity);
document.getElementById('flip-horizontal').addEventListener('click', flipObjectHorizontal);
document.getElementById('flip-vertical').addEventListener('click', flipObjectVertical);

// Alinhamento
document.querySelectorAll('.alignment-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        alignObjects(this.dataset.align);
    });
});

// Controles de texto
document.getElementById('text-content').addEventListener('input', updateTextContent);
document.getElementById('font-family').addEventListener('change', updateTextStyle);
document.getElementById('font-size').addEventListener('input', updateTextStyle);
document.getElementById('text-color').addEventListener('input', updateTextStyle);
document.getElementById('text-align').addEventListener('change', updateTextStyle);
document.getElementById('font-weight').addEventListener('change', updateTextStyle);

// Controles de fundo
document.getElementById('apply-background').addEventListener('click', applyBackground);
document.getElementById('remove-background').addEventListener('click', removeBackground);
document.getElementById('background-color').addEventListener('input', applyBackgroundColor);

// Camadas
document.getElementById('add-layer-btn').addEventListener('click', addNewLayer);

// Exportar
document.getElementById('export-btn').addEventListener('click', exportToPDF);

// Preview
document.getElementById('preview-btn').addEventListener('click', showPreview);

// Salvar
document.getElementById('save-btn').addEventListener('click', saveToSessionStorage);

// Undo/Redo buttons (opcionais)
const undoBtn = document.getElementById('undo-btn');
if (undoBtn) {
    undoBtn.addEventListener('click', (event) => {
        event.preventDefault();
        undo();
    });
}

const redoBtn = document.getElementById('redo-btn');
if (redoBtn) {
    redoBtn.addEventListener('click', (event) => {
        event.preventDefault();
        redo();
    });
}

// Zoom
document.getElementById('zoom-in').addEventListener('click', () => changeZoom(0.25, null));
document.getElementById('zoom-out').addEventListener('click', () => changeZoom(-0.25, null));
document.getElementById('zoom-reset').addEventListener('click', () => resetZoom());

// Zoom com scroll do mouse (sem necessidade de CTRL)
workspaceArea.addEventListener('wheel', handleWheel);

// Pan (arrastar workspace) - apenas com botão do meio ou quando o modo pan estiver ativo
workspaceArea.addEventListener('mousedown', startPan);
document.addEventListener('mousemove', handlePan);
document.addEventListener('mouseup', stopPan);

// Ocultar rótulos
hideLabelsBtn.addEventListener('click', toggleLabels);

// Ocultar sangria
hideBleedBtn.addEventListener('click', toggleBleed);

// Teclado
    document.addEventListener('keydown', handleKeyDown);
}

function initializeSizeControls() {
    const widthInput = document.getElementById('width');
    const heightInput = document.getElementById('height');

    if (!widthInput || !heightInput) {
        return;
    }

    // Evitar criar os controles mais de uma vez
    if (sizeUnitSelect) {
        sizeUnitSelect.value = state.sizeUnit;
    }

    if (!sizeUnitSelect) {
        sizeUnitSelect = document.createElement('select');
        sizeUnitSelect.id = 'size-unit';
        sizeUnitSelect.className = 'size-unit-select';

        const pxOption = document.createElement('option');
        pxOption.value = 'px';
        pxOption.textContent = 'px';

        const mmOption = document.createElement('option');
        mmOption.value = 'mm';
        mmOption.textContent = 'mm';

        sizeUnitSelect.appendChild(pxOption);
        sizeUnitSelect.appendChild(mmOption);
        sizeUnitSelect.value = state.sizeUnit;

        sizeUnitSelect.addEventListener('change', () => {
            state.sizeUnit = sizeUnitSelect.value;
            updatePropertiesPanel();
        });
    }

    if (!aspectLockBtn) {
        aspectLockBtn = document.createElement('button');
        aspectLockBtn.type = 'button';
        aspectLockBtn.id = 'size-lock';
        aspectLockBtn.className = 'size-lock-toggle';
        updateAspectLockButton();

        aspectLockBtn.addEventListener('click', () => {
            state.keepAspectRatio = !state.keepAspectRatio;
            updateAspectLockButton();

            if (state.keepAspectRatio && state.selectedObjects.length > 0) {
                const object = state.selectedObjects[0];
                state.aspectRatio = getObjectAspectRatio(object);
            }
        });
    }

    if (aspectLockBtn) {
        updateAspectLockButton();
    }

    const existingWrapper = document.querySelector('.size-extra-controls');
    if (existingWrapper) {
        existingWrapper.appendChild(sizeUnitSelect);
        existingWrapper.appendChild(aspectLockBtn);
        return;
    }

    // Adicionar os controles próximos aos inputs de largura/altura
    const controlsWrapper = document.createElement('div');
    controlsWrapper.className = 'size-extra-controls';
    controlsWrapper.appendChild(sizeUnitSelect);
    controlsWrapper.appendChild(aspectLockBtn);

    if (heightInput.parentElement) {
        heightInput.parentElement.appendChild(controlsWrapper);
    } else {
        heightInput.insertAdjacentElement('afterend', controlsWrapper);
    }
}

function updateAspectLockButton() {
    if (!aspectLockBtn) return;

    aspectLockBtn.textContent = state.keepAspectRatio ? '🔒' : '🔓';
    aspectLockBtn.title = state.keepAspectRatio ? 'Desbloquear proporção' : 'Bloquear proporção';
    aspectLockBtn.classList.toggle('locked', state.keepAspectRatio);
    aspectLockBtn.setAttribute('aria-pressed', state.keepAspectRatio ? 'true' : 'false');
}

function getObjectAspectRatio(object) {
    const widthPx = object.getScaledWidth ? object.getScaledWidth() : object.width * object.scaleX;
    const heightPx = object.getScaledHeight ? object.getScaledHeight() : object.height * object.scaleY;

    if (!heightPx) {
        return 1;
    }

    return widthPx / heightPx;
}

// Inicializar os canvases do Fabric.js
function initializeFabricCanvases() {
// Converter mm para px
const widthPx = state.cardConfig.width * PX_PER_MM;
const heightPx = state.cardConfig.height * PX_PER_MM;

// Canvas da frente
state.canvases.front = new fabric.Canvas('front-canvas', {
    width: widthPx,
    height: heightPx,
    selection: true,
    preserveObjectStacking: true
});

// Canvas do verso
state.canvases.back = new fabric.Canvas('back-canvas', {
    width: widthPx,
    height: heightPx,
    selection: true,
    preserveObjectStacking: true
});

// Configurar eventos para ambos os canvases
Object.values(state.canvases).forEach(canvas => {
    canvas.on('selection:created', function(e) {
        state.selectedObjects = e.selected;
        updatePropertiesPanel();
        updateLayersList();
    });
    
    canvas.on('selection:updated', function(e) {
        state.selectedObjects = e.selected;
        updatePropertiesPanel();
        updateLayersList();
    });
    
    canvas.on('selection:cleared', function() {
        state.selectedObjects = [];
        updatePropertiesPanel();
        updateLayersList();
    });
    
    canvas.on('object:modified', function(e) {
        updatePropertiesPanel();
        updateLayersList();
        scheduleHistorySnapshot();
    });

    canvas.on('object:added', function(e) {
        const object = e.target;
        const side = getObjectSide(object);
        
        // Adicionar à lista de camadas
        addLayer(object, side);

        updateLayersList();

        if (!state.history.applying) {
            scheduleHistorySnapshot();
        }
    });

    canvas.on('object:removed', function(e) {
        const object = e.target;
        const side = getObjectSide(object);
        
        // Remover da lista de camadas
        removeLayer(object, side);

        updateLayersList();

        if (!state.history.applying) {
            scheduleHistorySnapshot();
        }
    });
    
    // Adicionar texto ao clicar com a ferramenta de texto
    canvas.on('mouse:down', function(options) {
        if (state.currentTool === 'text' && options.target === null) {
            addTextAtPosition(options.pointer.x, options.pointer.y);
        } else if (state.currentTool === 'rectangle' && options.target === null) {
            addRectangleAtPosition(options.pointer.x, options.pointer.y);
        } else if (state.currentTool === 'circle' && options.target === null) {
            addCircleAtPosition(options.pointer.x, options.pointer.y);
        }
    });
});
}

// Atualizar tamanho dos canvases
function updateCanvasSize() {
const widthPx = state.cardConfig.width * PX_PER_MM;
const heightPx = state.cardConfig.height * PX_PER_MM;

Object.values(state.canvases).forEach(canvas => {
    canvas.setDimensions({
        width: widthPx,
        height: heightPx
    });
    canvas.renderAll();
});

updateBleedLines();
updateCanvasBorder();
}

// Atualizar borda do canvas - FUNÇÃO CORRIGIDA
function updateCanvasBorder() {
// Removemos a borda, então apenas ajustamos o border-radius
const borderRadiusPx = state.cardConfig.rounded ? state.cardConfig.borderRadius * PX_PER_MM : 0;

// Aplicar border-radius aos canvases internos
const canvases = document.querySelectorAll('.canvas-wrapper canvas');
canvases.forEach(canvas => {
    canvas.style.borderRadius = `${borderRadiusPx}px`;
});

// Aplicar border-radius aos wrappers
const wrappers = document.querySelectorAll('.canvas-wrapper');
wrappers.forEach(wrapper => {
    wrapper.style.borderRadius = `${borderRadiusPx}px`;
});

if (state.cardConfig.rounded) {
    canvasContainer.classList.add('rounded');
} else {
    canvasContainer.classList.remove('rounded');
}
}

// Centralizar o container do canvas
function centerCanvasContainer() {
canvasContainer.style.left = '50%';
canvasContainer.style.top = '50%';
canvasContainer.style.transform = 'translate(-50%, -50%)';
}

// Atualizar linhas de sangria
function updateBleedLines() {
const bleedMargin = 3; // 5mm
const bleedPx = bleedMargin * PX_PER_MM; // Converter para px

[frontBleed, backBleed].forEach(bleedLine => {
    bleedLine.style.width = `calc(100% - ${bleedPx * 2}px)`;
    bleedLine.style.height = `calc(100% - ${bleedPx * 2}px)`;
    bleedLine.style.top = `${bleedPx}px`;
    bleedLine.style.left = `${bleedPx}px`;
});
}

// Definir ferramenta atual
function setTool(tool) {
state.currentTool = tool;

document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
document.getElementById(`${tool}-tool`).classList.add('active');

const currentCanvas = state.canvases[state.currentSide];

if (tool === 'select') {
    currentCanvas.selection = true;
    currentCanvas.defaultCursor = 'default';
    currentCanvas.hoverCursor = 'move';
} else if (tool === 'qrcode') {
    currentCanvas.selection = true; // Permitir seleção, mas vamos adicionar um QR Code no clique
    currentCanvas.defaultCursor = 'crosshair';
    currentCanvas.hoverCursor = 'crosshair';
} else {
    currentCanvas.selection = false;
    currentCanvas.defaultCursor = 'crosshair';
    currentCanvas.hoverCursor = 'crosshair';
}
}
    
// Manipular upload de imagem
function handleImageUpload(e) {
const file = e.target.files[0];
if (!file) return;

const reader = new FileReader();
reader.onload = function(event) {
    addImageToCanvas(event.target.result, file.name);
};
reader.readAsDataURL(file);

// Limpar o input para permitir upload da mesma imagem novamente
e.target.value = '';

// Voltar para a ferramenta de seleção
setTool('select');
}

// Manipular upload de SVG
function handleSVGUpload(e) {
const file = e.target.files[0];
if (!file) return;

const reader = new FileReader();
reader.onload = function(event) {
    addSVGToCanvas(event.target.result, file.name);
};
reader.readAsText(file);

// Limpar o input para permitir upload do mesmo SVG novamente
e.target.value = '';

// Voltar para a ferramenta de seleção
setTool('select');
}

// Adicionar imagem ao canvas
function addImageToCanvas(src, filename = 'Imagem') {
const currentCanvas = state.canvases[state.currentSide];

fabric.Image.fromURL(src, function(img) {
    // Configurar a imagem
    img.set({
        left: 50,
        top: 50,
        scaleX: 0.5,
        scaleY: 0.5,
        name: filename,
        type: 'image'
    });
    
    currentCanvas.add(img);
    currentCanvas.setActiveObject(img);
    currentCanvas.renderAll();
    
    updatePropertiesPanel();
    updateLayersList();
});
}

// Adicionar SVG ao canvas
function addSVGToCanvas(svgString, filename = 'SVG') {
const currentCanvas = state.canvases[state.currentSide];

fabric.loadSVGFromString(svgString, function(objects, options) {
    const group = fabric.util.groupSVGElements(objects, options);
    
    // Configurar o grupo SVG
    group.set({
        left: 50,
        top: 50,
        scaleX: 0.5,
        scaleY: 0.5,
        name: filename,
        type: 'svg'
    });
    
    currentCanvas.add(group);
    currentCanvas.setActiveObject(group);
    currentCanvas.renderAll();
    
    updatePropertiesPanel();
    updateLayersList();
});
}

// Adicionar texto na posição do clique
function addTextAtPosition(x, y) {
const currentCanvas = state.canvases[state.currentSide];

const text = new fabric.IText('Digite seu texto', {
    left: x,
    top: y,
    fontFamily: 'Arial',
    fontSize: 16,
    fill: '#000000',
    name: 'Texto',
    type: 'text'
});

currentCanvas.add(text);
currentCanvas.setActiveObject(text);
currentCanvas.renderAll();

updatePropertiesPanel();
updateLayersList();

// Voltar para a ferramenta de seleção
setTool('select');
}

// Adicionar retângulo na posição do clique
function addRectangleAtPosition(x, y) {
const currentCanvas = state.canvases[state.currentSide];

const rect = new fabric.Rect({
    left: x,
    top: y,
    width: 100,
    height: 60,
    fill: '#3498db',
    stroke: '#2980b9',
    strokeWidth: 2,
    rx: 0, // NOVO: raio horizontal inicial
    ry: 0, // NOVO: raio vertical inicial
    name: 'Retângulo',
    type: 'rect'
});

currentCanvas.add(rect);
currentCanvas.setActiveObject(rect);
currentCanvas.renderAll();

updatePropertiesPanel();
updateLayersList();

setTool('select');
}

// Adicionar círculo na posição do clique
function addCircleAtPosition(x, y) {
const currentCanvas = state.canvases[state.currentSide];

const circle = new fabric.Circle({
    left: x,
    top: y,
    radius: 50,
    fill: '#e74c3c',
    stroke: '#c0392b',
    strokeWidth: 2,
    name: 'Círculo',
    type: 'circle'
});

currentCanvas.add(circle);
currentCanvas.setActiveObject(circle);
currentCanvas.renderAll();

updatePropertiesPanel();
updateLayersList();

// Voltar para a ferramenta de seleção
setTool('select');
}

// Aplicar configurações do cartão - FUNÇÃO CORRIGIDA
function applyCardConfig() {
const width = parseInt(document.getElementById('card-width').value);
const height = parseInt(document.getElementById('card-height').value);
const rounded = document.getElementById('card-rounded').value === 'yes';
const borderRadius = rounded ? parseInt(document.getElementById('border-radius').value) : 0;

state.cardConfig = {
width,
height,
rounded,
borderRadius
};

updateCanvasSize();
updateCanvasBorder(); // Esta função ainda usa borderWidth e borderColor? Vamos ajustá-la.

recordHistorySnapshot();
}

function convertPxToUnit(valuePx, unit = state.sizeUnit) {
if (unit === 'mm') {
    return valuePx / PX_PER_MM;
}

return valuePx;
}

function convertUnitToPx(value, unit = state.sizeUnit) {
if (unit === 'mm') {
    return value * PX_PER_MM;
}

return value;
}

function formatDimension(value, unit = state.sizeUnit) {
if (unit === 'mm') {
    return parseFloat(value.toFixed(2)).toString();
}

return Math.round(value).toString();
}

function convertPxToUnit(valuePx, unit = state.sizeUnit) {
if (unit === 'mm') {
    return valuePx / PX_PER_MM;
}

return valuePx;
}

function convertUnitToPx(value, unit = state.sizeUnit) {
if (unit === 'mm') {
    return value * PX_PER_MM;
}

return value;
}

function formatDimension(value, unit = state.sizeUnit) {
if (unit === 'mm') {
    return parseFloat(value.toFixed(2)).toString();
}

return Math.round(value).toString();
}

// Atualizar painel de propriedades
function updatePropertiesPanel() {
if (state.selectedObjects.length === 0) {
    propertiesPanel.style.display = 'none';
    return;
}

propertiesPanel.style.display = 'block';

const object = state.selectedObjects[0];

if (sizeUnitSelect) {
    sizeUnitSelect.value = state.sizeUnit;
}

document.getElementById('pos-x').value = Math.round(object.left);
document.getElementById('pos-y').value = Math.round(object.top);

const widthPx = object.getScaledWidth ? object.getScaledWidth() : object.width * object.scaleX;
const heightPx = object.getScaledHeight ? object.getScaledHeight() : object.height * object.scaleY;

if (heightPx) {
    state.aspectRatio = widthPx / heightPx;
} else {
    state.aspectRatio = 1;
}

const displayWidth = formatDimension(convertPxToUnit(widthPx));
const displayHeight = formatDimension(convertPxToUnit(heightPx));

document.getElementById('width').value = displayWidth;
document.getElementById('height').value = displayHeight;

document.getElementById('rotation').value = Math.round(object.angle);
document.getElementById('rotation-value').textContent = `${Math.round(object.angle)}°`;

document.getElementById('opacity').value = Math.round(object.opacity * 100);
document.getElementById('opacity-value').textContent = `${Math.round(object.opacity * 100)}%`;

if (object.type === 'i-text' || object.type === 'text') {
    document.getElementById('text-content').value = object.text;
    document.getElementById('font-family').value = object.fontFamily;
    document.getElementById('font-size').value = object.fontSize;
    document.getElementById('text-color').value = rgbToHex(object.fill);
    document.getElementById('text-align').value = object.textAlign;
    document.getElementById('font-weight').value = object.fontWeight;
    
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelector('.tab[data-tab="text"]').classList.add('active');
    document.getElementById('text-tab').classList.add('active');
} 
else if (object.type === 'rect' || object.type === 'rectangle' || object.type === 'circle') {
    document.getElementById('shape-fill').value = rgbToHex(object.fill);
    document.getElementById('shape-stroke').value = rgbToHex(object.stroke);
    document.getElementById('shape-stroke-width').value = object.strokeWidth;
    
    // NOVO: Preencher o valor do raio para retângulos
    if (object.type === 'rect' || object.type === 'rectangle') {
        document.getElementById('shape-rx').value = object.rx || 0;
    } else {
        document.getElementById('shape-rx').value = 0;
    }
    
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelector('.tab[data-tab="shape"]').classList.add('active');
    document.getElementById('shape-tab').classList.add('active');
} else {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelector('.tab[data-tab="adjustments"]').classList.add('active');
    document.getElementById('adjustments-tab').classList.add('active');
}

// Após determinar o objeto selecionado, vamos controlar a aba de texto.
const textTab = document.querySelector('.tab[data-tab="text"]');
if (state.selectedObjects.length === 0 || 
    (state.selectedObjects[0].type !== 'i-text' && state.selectedObjects[0].type !== 'text')) {
    textTab.classList.add('disabled');
} else {
    textTab.classList.remove('disabled');
}

}

// Atualizar posição do objeto
function updateObjectPosition() {
if (state.selectedObjects.length === 0) return;

const x = parseInt(document.getElementById('pos-x').value);
const y = parseInt(document.getElementById('pos-y').value);

state.selectedObjects.forEach(object => {
    object.set({
        left: x,
        top: y
    });
});

const currentCanvas = state.canvases[state.currentSide];
currentCanvas.renderAll();

scheduleHistorySnapshot();
}

// Atualizar tamanho do objeto
function updateObjectSize(e) {
if (state.selectedObjects.length === 0) return;

const widthInput = document.getElementById('width');
const heightInput = document.getElementById('height');
let widthValue = parseFloat(widthInput.value);
let heightValue = parseFloat(heightInput.value);

if (isNaN(widthValue) || isNaN(heightValue)) {
    return;
}

const source = e && e.target ? e.target.id : null;
let widthPx = convertUnitToPx(widthValue);
let heightPx = convertUnitToPx(heightValue);

if (state.keepAspectRatio && state.aspectRatio > 0) {
    if (source === 'width') {
        heightPx = widthPx / state.aspectRatio;
        const adjustedHeight = convertPxToUnit(heightPx);
        heightInput.value = formatDimension(adjustedHeight);
    } else if (source === 'height') {
        widthPx = heightPx * state.aspectRatio;
        const adjustedWidth = convertPxToUnit(widthPx);
        widthInput.value = formatDimension(adjustedWidth);
    } else {
        heightPx = widthPx / state.aspectRatio;
        heightInput.value = formatDimension(convertPxToUnit(heightPx));
    }
}

state.selectedObjects.forEach(object => {
    const baseWidth = object.width;
    const baseHeight = object.height;

    if (!baseWidth || !baseHeight) {
        return;
    }

    if (state.keepAspectRatio && state.aspectRatio > 0) {
        const uniformScale = widthPx / baseWidth;
        object.set({
            scaleX: uniformScale,
            scaleY: uniformScale
        });
    } else {
        const scaleX = widthPx / baseWidth;
        const scaleY = heightPx / baseHeight;

        object.set({
            scaleX: scaleX,
            scaleY: scaleY
        });
    }
});

const currentCanvas = state.canvases[state.currentSide];
currentCanvas.renderAll();

if (heightPx > 0) {
    state.aspectRatio = widthPx / heightPx;
}

scheduleHistorySnapshot();
}

// Atualizar rotação do objeto
function updateObjectRotation() {
if (state.selectedObjects.length === 0) return;

const rotation = parseInt(document.getElementById('rotation').value);
document.getElementById('rotation-value').textContent = `${rotation}°`;

state.selectedObjects.forEach(object => {
    object.set({
        angle: rotation
    });
});

const currentCanvas = state.canvases[state.currentSide];
currentCanvas.renderAll();

scheduleHistorySnapshot();
}

// Atualizar opacidade do objeto
function updateObjectOpacity() {
if (state.selectedObjects.length === 0) return;

const opacity = parseInt(document.getElementById('opacity').value) / 100;
document.getElementById('opacity-value').textContent = `${Math.round(opacity * 100)}%`;

state.selectedObjects.forEach(object => {
    object.set({
        opacity: opacity
    });
});

const currentCanvas = state.canvases[state.currentSide];
currentCanvas.renderAll();

scheduleHistorySnapshot();
}

// Inverter objeto horizontalmente
function flipObjectHorizontal() {
if (state.selectedObjects.length === 0) return;

state.selectedObjects.forEach(object => {
    object.set({
        flipX: !object.flipX
    });
});

const currentCanvas = state.canvases[state.currentSide];
currentCanvas.renderAll();

scheduleHistorySnapshot();
}

// Inverter objeto verticalmente
function flipObjectVertical() {
if (state.selectedObjects.length === 0) return;

state.selectedObjects.forEach(object => {
    object.set({
        flipY: !object.flipY
    });
});

const currentCanvas = state.canvases[state.currentSide];
currentCanvas.renderAll();

scheduleHistorySnapshot();
}

// Alinhar objetos
function alignObjects(alignment) {
if (state.selectedObjects.length === 0) return;

const currentCanvas = state.canvases[state.currentSide];
const canvasWidth = currentCanvas.getWidth();
const canvasHeight = currentCanvas.getHeight();

if (state.selectedObjects.length === 1) {
    // Alinhar em relação ao canvas
    const object = state.selectedObjects[0];
    const objectWidth = object.width * object.scaleX;
    const objectHeight = object.height * object.scaleY;
    
    switch (alignment) {
        case 'left':
            object.set({ left: 0 });
            break;
        case 'center-x':
            object.set({ left: (canvasWidth - objectWidth) / 2 });
            break;
        case 'right':
            object.set({ left: canvasWidth - objectWidth });
            break;
        case 'top':
            object.set({ top: 0 });
            break;
        case 'center-y':
            object.set({ top: (canvasHeight - objectHeight) / 2 });
            break;
        case 'bottom':
            object.set({ top: canvasHeight - objectHeight });
            break;
        case 'center-both':
            object.set({
                left: (canvasWidth - objectWidth) / 2,
                top: (canvasHeight - objectHeight) / 2
            });
            break;
    }
} else {
    // Alinhar múltiplos objetos
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    
    state.selectedObjects.forEach(object => {
        const objectWidth = object.width * object.scaleX;
        const objectHeight = object.height * object.scaleY;
        
        minX = Math.min(minX, object.left);
        maxX = Math.max(maxX, object.left + objectWidth);
        minY = Math.min(minY, object.top);
        maxY = Math.max(maxY, object.top + objectHeight);
    });
    
    const selectionWidth = maxX - minX;
    const selectionHeight = maxY - minY;
    
    switch (alignment) {
        case 'left':
            state.selectedObjects.forEach(object => {
                object.set({ left: minX });
            });
            break;
        case 'center-x':
            const centerX = minX + selectionWidth / 2;
            state.selectedObjects.forEach(object => {
                const objectWidth = object.width * object.scaleX;
                object.set({ left: centerX - objectWidth / 2 });
            });
            break;
        case 'right':
            state.selectedObjects.forEach(object => {
                const objectWidth = object.width * object.scaleX;
                object.set({ left: maxX - objectWidth });
            });
            break;
        case 'top':
            state.selectedObjects.forEach(object => {
                object.set({ top: minY });
            });
            break;
        case 'center-y':
            const centerY = minY + selectionHeight / 2;
            state.selectedObjects.forEach(object => {
                const objectHeight = object.height * object.scaleY;
                object.set({ top: centerY - objectHeight / 2 });
            });
            break;
        case 'bottom':
            state.selectedObjects.forEach(object => {
                const objectHeight = object.height * object.scaleY;
                object.set({ top: maxY - objectHeight });
            });
            break;
        case 'center-both':
            const centerBothX = (canvasWidth - selectionWidth) / 2;
            const centerBothY = (canvasHeight - selectionHeight) / 2;
            
            state.selectedObjects.forEach(object => {
                object.set({
                    left: centerBothX + (object.left - minX),
                    top: centerBothY + (object.top - minY)
                });
            });
            break;
    }
}

currentCanvas.renderAll();
updatePropertiesPanel();

scheduleHistorySnapshot();
}

// Atualizar conteúdo do texto
function updateTextContent() {
if (state.selectedObjects.length !== 1 || 
    (state.selectedObjects[0].type !== 'i-text' && state.selectedObjects[0].type !== 'text')) return;

state.selectedObjects[0].set({
    text: document.getElementById('text-content').value
});

const currentCanvas = state.canvases[state.currentSide];
currentCanvas.renderAll();

scheduleHistorySnapshot();
}

// Atualizar estilo do texto
function updateTextStyle() {
if (state.selectedObjects.length !== 1 || 
    (state.selectedObjects[0].type !== 'i-text' && state.selectedObjects[0].type !== 'text')) return;

const object = state.selectedObjects[0];
object.set({
    fontFamily: document.getElementById('font-family').value,
    fontSize: parseInt(document.getElementById('font-size').value),
    fill: document.getElementById('text-color').value,
    textAlign: document.getElementById('text-align').value,
    fontWeight: document.getElementById('font-weight').value
});

const currentCanvas = state.canvases[state.currentSide];
currentCanvas.renderAll();

scheduleHistorySnapshot();
}

// Duplicar objetos selecionados
function duplicateSelectedObjects() {
if (state.selectedObjects.length === 0) return;

const currentCanvas = state.canvases[state.currentSide];
const newObjects = [];

state.selectedObjects.forEach(originalObject => {
    originalObject.clone(function(cloned) {
        // Deslocar um pouco do original
        cloned.set({
            left: cloned.left + 20,
            top: cloned.top + 20
        });
        
        currentCanvas.add(cloned);
        newObjects.push(cloned);
        
        // Se todos os objetos foram clonados, selecioná-los
        if (newObjects.length === state.selectedObjects.length) {
            currentCanvas.discardActiveObject();
            const selection = new fabric.ActiveSelection(newObjects, {
                canvas: currentCanvas
            });
            currentCanvas.setActiveObject(selection);
            currentCanvas.renderAll();
            
            updatePropertiesPanel();
            updateLayersList();
        }
    });
});
}

// Agrupar objetos selecionados
function groupSelectedObjects() {
if (state.selectedObjects.length < 2) return;

const currentCanvas = state.canvases[state.currentSide];
const group = new fabric.Group(state.selectedObjects, {
    name: `Grupo ${Object.keys(state.groups).length + 1}`,
    type: 'group'
});

// Remover objetos individuais do canvas
state.selectedObjects.forEach(object => {
    currentCanvas.remove(object);
});

// Adicionar o grupo
currentCanvas.add(group);
currentCanvas.setActiveObject(group);
currentCanvas.renderAll();

// Salvar o grupo no estado
const groupId = `group-${Date.now()}`;
state.groups[groupId] = {
    id: groupId,
    name: group.name,
    objects: state.selectedObjects,
    side: state.currentSide
};

group.groupId = groupId;

updatePropertiesPanel();
updateLayersList();
}

// Desagrupar objetos selecionados
function ungroupSelectedObjects() {
if (state.selectedObjects.length !== 1 || state.selectedObjects[0].type !== 'group') return;

const currentCanvas = state.canvases[state.currentSide];
const group = state.selectedObjects[0];

// Obter os objetos do grupo
const objects = group.getObjects();

// Remover o grupo do canvas
currentCanvas.remove(group);

// Adicionar os objetos individuais de volta ao canvas
objects.forEach(object => {
    currentCanvas.add(object);
});

// Selecionar os objetos desagrupados
currentCanvas.discardActiveObject();
const selection = new fabric.ActiveSelection(objects, {
    canvas: currentCanvas
});
currentCanvas.setActiveObject(selection);
currentCanvas.renderAll();

// Remover o grupo do estado
if (group.groupId) {
    delete state.groups[group.groupId];
}

updatePropertiesPanel();
updateLayersList();
}

// Excluir objetos selecionados
function deleteSelectedObjects() {
if (state.selectedObjects.length === 0) return;

const currentCanvas = state.canvases[state.currentSide];

state.selectedObjects.forEach(object => {
    currentCanvas.remove(object);
});

currentCanvas.discardActiveObject();
currentCanvas.renderAll();

state.selectedObjects = [];
updatePropertiesPanel();
updateLayersList();
}

// Trazer objeto para frente
function bringToFront() {
if (state.selectedObjects.length === 0) return;

const currentCanvas = state.canvases[state.currentSide];

state.selectedObjects.forEach(object => {
    currentCanvas.bringToFront(object);
});

currentCanvas.renderAll();
updateLayersList();

scheduleHistorySnapshot();
}

// Enviar objeto para trás
function sendToBack() {
if (state.selectedObjects.length === 0) return;

const currentCanvas = state.canvases[state.currentSide];

state.selectedObjects.forEach(object => {
    currentCanvas.sendToBack(object);
});

currentCanvas.renderAll();
updateLayersList();

scheduleHistorySnapshot();
}

// Aplicar cor de fundo
function applyBackgroundColor() {
const color = document.getElementById('background-color').value;
const currentCanvas = state.canvases[state.currentSide];
currentCanvas.backgroundColor = color;
currentCanvas.renderAll();

scheduleHistorySnapshot();
}

// Aplicar imagem de fundo
function applyBackground() {
const file = backgroundImageInput.files[0];
if (!file) return;

const reader = new FileReader();
reader.onload = function(event) {
    const currentCanvas = state.canvases[state.currentSide];
    
    fabric.Image.fromURL(event.target.result, function(img) {
        // Configurar a imagem para cobrir todo o canvas
        img.set({
            scaleX: currentCanvas.width / img.width,
            scaleY: currentCanvas.height / img.height,
            selectable: false,
            evented: false
        });
        
        // Enviar a imagem para o fundo
        currentCanvas.sendToBack(img);
        currentCanvas.setBackgroundImage(img, function() {
            currentCanvas.renderAll();
            recordHistorySnapshot();
        });
    });
};
reader.readAsDataURL(file);
}

// Remover imagem de fundo
function removeBackground() {
const currentCanvas = state.canvases[state.currentSide];
currentCanvas.setBackgroundImage(null, function() {
    currentCanvas.renderAll();
});
document.getElementById('background-color').value = '#ffffff';
currentCanvas.backgroundColor = '#ffffff';
currentCanvas.renderAll();

recordHistorySnapshot();
}

// Adicionar camada
function addLayer(object, side) {
const id = `layer-${Date.now()}`;
object.layerId = id;

state.layers[side].push({
    id,
    name: object.name || 'Elemento',
    object,
    visible: object.visible !== false
});

updateLayersList();
}

// Remover camada
function removeLayer(object, side) {
const layerIndex = state.layers[side].findIndex(layer => layer.object === object);
if (layerIndex !== -1) {
    state.layers[side].splice(layerIndex, 1);
}

updateLayersList();
}

// Obter o lado (front/back) de um objeto
function getObjectSide(object) {
if (state.canvases.front.getObjects().includes(object)) return 'front';
if (state.canvases.back.getObjects().includes(object)) return 'back';
return state.currentSide;
}

// Atualizar lista de camadas
function updateLayersList() {
layerListFront.innerHTML = '';
layerListBack.innerHTML = '';

state.layers.front.forEach(layer => {
    layer.visible = layer.object.visible !== false;
});
state.layers.back.forEach(layer => {
    layer.visible = layer.object.visible !== false;
});

// Atualizar camadas da frente
state.layers.front.forEach((layer, index) => {
    const li = createLayerListItem(layer, index, 'front');
    layerListFront.appendChild(li);
});

// Atualizar camadas do verso
state.layers.back.forEach((layer, index) => {
    const li = createLayerListItem(layer, index, 'back');
    layerListBack.appendChild(li);
});
}

// Criar item da lista de camadas
function createLayerListItem(layer, index, side) {
const li = document.createElement('li');
li.classList.add('layer-item');
li.dataset.index = index;
li.dataset.side = side;

// Verificar se o objeto está selecionado
if (state.selectedObjects.includes(layer.object)) {
    li.classList.add('active');
}

// Determinar o ícone baseado no tipo de objeto
let icon = '❓';
if (layer.object.type === 'i-text' || layer.object.type === 'text') {
    icon = 'T';
} else if (layer.object.type === 'image') {
    icon = '🖼️';
} else if (layer.object.type === 'group') {
    icon = '📁';
} else if (layer.object.type === 'rect') {
    icon = '▭';
} else if (layer.object.type === 'circle') {
    icon = '●';
}

const visibilityIcon = layer.visible ? '👁️' : '🙈';

li.innerHTML = `
    <span class="layer-icon">${icon}</span>
    <span class="layer-name">${layer.name}</span>
    <div class="layer-actions">
        <button class="layer-btn" data-action="visibility">${visibilityIcon}</button>
        <button class="layer-btn" data-action="delete">🗑️</button>
    </div>
`;

// Selecionar camada ao clicar
li.addEventListener('click', (e) => {
    if (!e.target.classList.contains('layer-btn')) {
        const currentCanvas = state.canvases[side];
        currentCanvas.discardActiveObject();
        currentCanvas.setActiveObject(layer.object);
        currentCanvas.renderAll();
        
        updatePropertiesPanel();
        updateLayersList();
    }
});

// Ações das camadas
li.querySelector('[data-action="visibility"]').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleLayerVisibility(layer, side);
});

li.querySelector('[data-action="delete"]').addEventListener('click', (e) => {
    e.stopPropagation();
    const currentCanvas = state.canvases[side];
    currentCanvas.remove(layer.object);
    currentCanvas.renderAll();
    
    updatePropertiesPanel();
    updateLayersList();
});

return li;
}

// Alternar visibilidade da camada
function toggleLayerVisibility(layer, side) {
const isVisible = layer.object.visible !== false;
const newVisibility = !isVisible;

layer.object.visible = newVisibility;
layer.visible = newVisibility;

const currentCanvas = state.canvases[side];
currentCanvas.renderAll();
updateLayersList();

scheduleHistorySnapshot();
}

// Adicionar nova camada (botão)
function addNewLayer() {
if (state.currentTool === 'text') {
    setTool('text');
} else if (state.currentTool === 'rectangle') {
    setTool('rectangle');
} else if (state.currentTool === 'circle') {
    setTool('circle');
} else {
    imageUpload.click();
}
}

// Função auxiliar para converter RGB para HEX
function rgbToHex(rgb) {
if (!rgb) return '#ffffff';

// Se já for um valor hexadecimal, retornar como está
if (rgb.startsWith('#')) return rgb;

// Se for um objeto Fabric.js color
if (typeof rgb === 'object' && rgb.toHex) {
    return rgb.toHex();
}

// Converter rgb(r, g, b) para hexadecimal
const match = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
if (match) {
    const r = parseInt(match[1]);
    const g = parseInt(match[2]);
    const b = parseInt(match[3]);
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

// Converter rgba(r, g, b, a) para hexadecimal (ignorando alpha)
const rgbaMatch = rgb.match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/);
if (rgbaMatch) {
    const r = parseInt(rgbaMatch[1]);
    const g = parseInt(rgbaMatch[2]);
    const b = parseInt(rgbaMatch[3]);
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

// Se não conseguir converter, retornar branco
return '#ffffff';
}

// Manipular teclas
function handleKeyDown(e) {
// Undo/Redo
const key = typeof e.key === 'string' ? e.key.toLowerCase() : '';
const isModifier = e.ctrlKey || e.metaKey;

if (isModifier && key === 'z') {
    e.preventDefault();

    if (e.shiftKey) {
        redo();
    } else {
        undo();
    }

    return;
}

if (isModifier && key === 'y') {
    e.preventDefault();
    redo();
    return;
}

// Tecla Delete
if (e.key === 'Delete' && state.selectedObjects.length > 0) {
    deleteSelectedObjects();
}

// Agrupar com CTRL+G
if (e.ctrlKey && e.key === 'g' && state.selectedObjects.length > 1) {
    e.preventDefault();
    groupSelectedObjects();
}

// Desagrupar com CTRL+SHIFT+G
if (e.ctrlKey && e.shiftKey && e.key === 'G' && state.selectedObjects.length === 1 && state.selectedObjects[0].type === 'group') {
    e.preventDefault();
    ungroupSelectedObjects();
}

// Duplicar com CTRL+D
if (e.ctrlKey && e.key === 'd' && state.selectedObjects.length > 0) {
    e.preventDefault();
    duplicateSelectedObjects();
}

// Setas do teclado para movimentar objetos
if (state.selectedObjects.length > 0 && 
    (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
    e.preventDefault(); // Evitar rolagem da página
    
    const step = e.shiftKey ? 10 : 1; // Movimento maior com Shift
    let dx = 0, dy = 0;
    
    switch(e.key) {
        case 'ArrowLeft': dx = -step; break;
        case 'ArrowRight': dx = step; break;
        case 'ArrowUp': dy = -step; break;
        case 'ArrowDown': dy = step; break;
    }
    
    state.selectedObjects.forEach(object => {
        object.set({
            left: object.left + dx,
            top: object.top + dy
        });
    });
    
    const currentCanvas = state.canvases[state.currentSide];
    currentCanvas.renderAll();
    updatePropertiesPanel(); // Atualiza a posição no painel de propriedades
    scheduleHistorySnapshot();
}
}

// Controles de zoom
function changeZoom(delta, mousePos) {
const oldZoom = state.zoomLevel;
state.zoomLevel += delta;
state.zoomLevel = Math.max(0.25, Math.min(4, state.zoomLevel)); // Limitar entre 25% e 400%

// Se temos uma posição do mouse, fazer zoom centrado nessa posição
if (mousePos) {
    const rect = workspaceArea.getBoundingClientRect();
    const mouseX = mousePos.x - rect.left;
    const mouseY = mousePos.y - rect.top;
    
    // Calcular a posição atual do container
    const transform = window.getComputedStyle(canvasContainer).transform;
    let currentX = 0, currentY = 0;
    
    if (transform !== 'none') {
        const matrix = transform.match(/matrix\((.+)\)/)[1].split(', ');
        currentX = parseFloat(matrix[4]) || 0;
        currentY = parseFloat(matrix[5]) || 0;
    }
    
    // Calcular o ponto de zoom em relação ao centro do container
    const containerRect = canvasContainer.getBoundingClientRect();
    const containerCenterX = containerRect.left + containerRect.width / 2;
    const containerCenterY = containerRect.top + containerRect.height / 2;
    
    // Calcular o deslocamento necessário para manter o ponto do mouse fixo
    const zoomFactor = state.zoomLevel / oldZoom;
    const offsetX = (mouseX - containerCenterX - currentX) * (1 - zoomFactor);
    const offsetY = (mouseY - containerCenterY - currentY) * (1 - zoomFactor);
    
    // Aplicar a transformação
    canvasContainer.style.transform = `translate(calc(-50% + ${currentX + offsetX}px), calc(-50% + ${currentY + offsetY}px)) scale(${state.zoomLevel})`;
} else {
    // Zoom sem posição específica do mouse (botões)
    updateZoomTransform();
}

updateZoomDisplay();
}

function resetZoom() {
state.zoomLevel = 1;
centerCanvasContainer();
updateZoomTransform();
updateZoomDisplay();
}

function handleWheel(e) {
// Zoom com scroll do mouse (sem necessidade de CTRL)
e.preventDefault();
const delta = e.deltaY > 0 ? -0.1 : 0.1;
changeZoom(delta, { x: e.clientX, y: e.clientY });
}

function updateZoomTransform() {
canvasContainer.style.transform = `translate(-50%, -50%) scale(${state.zoomLevel})`;
}

function updateZoomDisplay() {
zoomLevel.textContent = `${Math.round(state.zoomLevel * 100)}%`;
}

// Controles de pan (arrastar workspace)
function startPan(e) {
// Apenas botão do meio do mouse ou quando o modo pan estiver ativo
if (e.button === 1 || (e.button === 0 && state.panMode)) {
    e.preventDefault();
    state.isPanning = true;
    state.panStartX = e.clientX;
    state.panStartY = e.clientY;
    
    // Obter posição atual do container
    const transform = window.getComputedStyle(canvasContainer).transform;
    if (transform !== 'none') {
        const matrix = transform.match(/matrix\((.+)\)/)[1].split(', ');
        state.containerStartX = parseFloat(matrix[4]) || 0;
        state.containerStartY = parseFloat(matrix[5]) || 0;
    } else {
        state.containerStartX = 0;
        state.containerStartY = 0;
    }
    
    workspaceArea.classList.add('panning');
    document.body.style.cursor = 'grabbing';
}
}

function handlePan(e) {
if (state.isPanning) {
    const dx = e.clientX - state.panStartX;
    const dy = e.clientY - state.panStartY;
    
    // Aplicar transformação de translação
    canvasContainer.style.transform = `translate(calc(-50% + ${state.containerStartX + dx}px), calc(-50% + ${state.containerStartY + dy}px)) scale(${state.zoomLevel})`;
}
}

function stopPan() {
state.isPanning = false;
workspaceArea.classList.remove('panning');
document.body.style.cursor = state.panMode ? 'grab' : 'default';
}

// Alternar visibilidade dos rótulos
function toggleLabels() {
state.labelsVisible = !state.labelsVisible;
const labels = document.querySelectorAll('.side-label');
labels.forEach(label => {
    label.style.display = state.labelsVisible ? 'block' : 'none';
});

hideLabelsBtn.innerHTML = state.labelsVisible ? 
    '<span>👁️</span> Ocultar Rótulos' : 
    '<span>👁️‍🗨️</span> Mostrar Rótulos';
}

// Alternar visibilidade da sangria
function toggleBleed() {
state.bleedVisible = !state.bleedVisible;
[frontBleed, backBleed].forEach(bleed => {
    bleed.style.display = state.bleedVisible ? 'block' : 'none';
});

hideBleedBtn.innerHTML = state.bleedVisible ?
    '<span>📐</span> Ocultar Sangria' :
    '<span>📏</span> Mostrar Sangria';
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
const r = Math.min(radius, width / 2, height / 2);
ctx.beginPath();
ctx.moveTo(x + r, y);
ctx.lineTo(x + width - r, y);
ctx.quadraticCurveTo(x + width, y, x + width, y + r);
ctx.lineTo(x + width, y + height - r);
ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
ctx.lineTo(x + r, y + height);
ctx.quadraticCurveTo(x, y + height, x, y + height - r);
ctx.lineTo(x, y + r);
ctx.quadraticCurveTo(x, y, x + r, y);
ctx.closePath();
}

function getRoundedCanvasDataURL(canvas, multiplier = 1) {
return new Promise(resolve => {
    const baseData = canvas.toDataURL({
        format: 'png',
        multiplier: multiplier
    });

    if (!state.cardConfig.rounded || !state.cardConfig.borderRadius) {
        resolve(baseData);
        return;
    }

    const width = canvas.getWidth() * multiplier;
    const height = canvas.getHeight() * multiplier;
    const radiusPx = Math.min(
        state.cardConfig.borderRadius * PX_PER_MM * multiplier,
        width / 2,
        height / 2
    );

    if (radiusPx <= 0) {
        resolve(baseData);
        return;
    }

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const ctx = tempCanvas.getContext('2d');

    ctx.save();
    drawRoundedRect(ctx, 0, 0, width, height, radiusPx);
    ctx.clip();

    const img = new Image();
    img.onload = () => {
        ctx.drawImage(img, 0, 0, width, height);
        ctx.restore();
        resolve(tempCanvas.toDataURL('image/png'));
    };
    img.onerror = () => {
        ctx.restore();
        resolve(baseData);
    };
    img.src = baseData;
});
}

// Mostrar preview
async function showPreview() {
const overlay = document.createElement('div');
overlay.className = 'preview-overlay';

const container = document.createElement('div');
container.className = 'preview-container';

// Criar imagens dos canvases
const frontImg = document.createElement('img');
frontImg.className = 'preview-side';

const backImg = document.createElement('img');
backImg.className = 'preview-side';

container.appendChild(frontImg);
container.appendChild(backImg);

const closeBtn = document.createElement('button');
closeBtn.className = 'close-preview';
closeBtn.textContent = 'Fechar Preview';
closeBtn.addEventListener('click', () => {
    document.body.removeChild(overlay);
});

overlay.appendChild(container);
overlay.appendChild(closeBtn);

document.body.appendChild(overlay);

try {
    const [frontSrc, backSrc] = await Promise.all([
        getRoundedCanvasDataURL(state.canvases.front, 2),
        getRoundedCanvasDataURL(state.canvases.back, 2)
    ]);

    frontImg.src = frontSrc;
    backImg.src = backSrc;
} catch (error) {
    console.error('Erro ao gerar preview', error);
    frontImg.src = state.canvases.front.toDataURL({ format: 'png', multiplier: 2 });
    backImg.src = state.canvases.back.toDataURL({ format: 'png', multiplier: 2 });
}

// Fechar com ESC
const closeHandler = (e) => {
    if (e.key === 'Escape') {
        document.body.removeChild(overlay);
        document.removeEventListener('keydown', closeHandler);
    }
};
document.addEventListener('keydown', closeHandler);

// Fechar ao clicar fora
overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
        document.body.removeChild(overlay);
        document.removeEventListener('keydown', closeHandler);
    }
});
}

// Exportar para PDF em alta resolução
async function exportToPDF() {
const { jsPDF } = window.jspdf;

// Criar um PDF com orientação paisagem para caber ambas as faces lado a lado
const pdf = new jsPDF('l', 'mm', 'a4');

// Converter dimensões do cartão de px para mm
const cardWidthMM = state.cardConfig.width;
const cardHeightMM = state.cardConfig.height;

// Calcular escala para caber no PDF
const pdfWidth = pdf.internal.pageSize.getWidth();
const pdfHeight = pdf.internal.pageSize.getHeight();

// Calcular tamanho máximo que cabe no PDF (deixando margem)
const margin = 10;
const maxWidth = (pdfWidth / 2) - (margin * 1.5);
const maxHeight = pdfHeight - (margin * 2);

// Calcular escala para manter proporção
const scaleX = maxWidth / cardWidthMM;
const scaleY = maxHeight / cardHeightMM;
const scale = Math.min(scaleX, scaleY);

const scaledWidth = cardWidthMM * scale;
const scaledHeight = cardHeightMM * scale;

// Calcular posições
const frontX = margin;
const backX = (pdfWidth / 2) + (margin / 2);
const y = (pdfHeight - scaledHeight) / 2;

// Adicionar frente em alta resolução
const [frontImgData, backImgData] = await Promise.all([
    getRoundedCanvasDataURL(state.canvases.front, 4),
    getRoundedCanvasDataURL(state.canvases.back, 4)
]);
pdf.addImage(frontImgData, 'PNG', frontX, y, scaledWidth, scaledHeight);

// Adicionar verso em alta resolução
pdf.addImage(backImgData, 'PNG', backX, y, scaledWidth, scaledHeight);

// Adicionar labels
pdf.setFontSize(12);
pdf.text('FRENTE', frontX + scaledWidth / 2, y - 5, { align: 'center' });
pdf.text('VERSO', backX + scaledWidth / 2, y - 5, { align: 'center' });

// Salvar PDF
pdf.save('cartao-alta-resolucao.pdf');
}

// Salvar para Session Storage
function saveToSessionStorage() {
const projectData = {
    cardConfig: state.cardConfig,
    frontCanvas: state.canvases.front.toJSON(),
    backCanvas: state.canvases.back.toJSON(),
    backgrounds: {
        front: state.canvases.front.backgroundColor,
        back: state.canvases.back.backgroundColor
    }
};

sessionStorage.setItem('cardEditorProject', JSON.stringify(projectData));
alert('Projeto salvo com sucesso!');
}

// Carregar do Session Storage
function loadFromSessionStorage() {
state.history.applying = true;
state.layers.front = [];
state.layers.back = [];

const savedData = sessionStorage.getItem('cardEditorProject');
if (savedData) {
let projectData;

try {
    projectData = JSON.parse(savedData);
} catch (error) {
    console.error('Erro ao ler projeto salvo', error);
    finalizeSessionLoad();
    return;
}

// Restaurar configurações do cartão
state.cardConfig = projectData.cardConfig;
document.getElementById('card-width').value = state.cardConfig.width;
document.getElementById('card-height').value = state.cardConfig.height;
document.getElementById('card-rounded').value = state.cardConfig.rounded ? 'yes' : 'no';
document.getElementById('border-radius').value = state.cardConfig.borderRadius;

if (state.cardConfig.rounded) {
borderRadiusControl.classList.add('active');
}

// Restaurar fundos de cor
if (projectData.backgrounds) {
const applySavedBackground = (side) => {
    const savedColor = projectData.backgrounds[side] || '#ffffff';
    state.canvases[side].backgroundColor = savedColor;
    state.canvases[side].renderAll();

    if (side === state.currentSide) {
        document.getElementById('global-background-color').value = rgbToHex(savedColor);
    }
    state.canvases[side].setBackgroundColor(savedColor, () => {
        state.canvases[side].renderAll();

        if (side === state.currentSide) {
            document.getElementById('global-background-color').value = rgbToHex(savedColor);
        }
    });
};

applySavedBackground('front');
applySavedBackground('back');
}

// Restaurar imagens de fundo
if (projectData.backgroundImages) {
// Vamos carregar as imagens de fundo se existirem
const loadBackgroundImage = (side, dataURL) => {
    return new Promise((resolve) => {
        if (dataURL) {
            fabric.Image.fromURL(dataURL, (img) => {
                state.canvases[side].setBackgroundImage(img, () => {
                    state.canvases[side].renderAll();
                    resolve();
                });
            });
        } else {
            resolve();
        }
    });
};

// Carregar as imagens de fundo em paralelo
Promise.all([
    loadBackgroundImage('front', projectData.backgroundImages.front),
    loadBackgroundImage('back', projectData.backgroundImages.back)
]).then(() => {
    // Após carregar as imagens, carregar os canvases
    return loadCanvases(projectData);
}).then(() => {
    finalizeSessionLoad();
}).catch((error) => {
    console.error('Erro ao carregar projeto salvo', error);
    finalizeSessionLoad();
});
} else {
loadCanvases(projectData).then(() => {
    finalizeSessionLoad();
}).catch((error) => {
    console.error('Erro ao carregar projeto salvo', error);
    finalizeSessionLoad();
});
}

function loadCanvases(projectData) {
// Função para carregar um canvas
const loadCanvas = (side, canvasData) => {
    return new Promise((resolve) => {
        if (canvasData) {
            state.canvases[side].loadFromJSON(canvasData, () => {
                state.canvases[side].renderAll();
                updateLayersList();
                resolve();
            });
        } else {
            resolve();
        }
    });
};

// Carregar os dois canvases
return Promise.all([
    loadCanvas('front', projectData.frontCanvas),
    loadCanvas('back', projectData.backCanvas)
]).then(() => {
    // Tudo carregado, agora atualizar o color picker
    applyCardConfig();
    updateGlobalBackgroundColorInput();
});
}
} else {
// Se não há dados salvos, ainda assim atualizamos o color picker para a cor atual
updateGlobalBackgroundColorInput();

finalizeSessionLoad();
}
}

function finalizeSessionLoad() {
    state.history.applying = false;
    setInitialHistorySnapshot();
}
