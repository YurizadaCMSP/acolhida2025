/**
 * GeoTracker Precision
 * Sistema avançado de geolocalização de alta precisão
 * Implementado com JavaScript puro, sem dependências externas
 */

// Configurações de Geolocalização
const GEO_CONFIG = {
    enableHighAccuracy: true,  // Solicita a maior precisão possível do dispositivo
    timeout: 15000,            // Tempo máximo (ms) para obter uma posição
    maximumAge: 0              // Não aceita posições em cache
};

// Configurações do Sistema
const APP_CONFIG = {
    updateInterval: 1000,      // Intervalo (ms) entre atualizações de posição
    positionFilter: 0,         // Distância mínima (m) para registrar uma nova posição
    avgSamples: 5,             // Número de amostras para cálculo de média
    enableTriangulation: true, // Ativar triangulação simulada para maior precisão
    maxHistoryItems: 100,      // Máximo de itens no histórico
    canvasUpdateRate: 30,      // Taxa de atualização do canvas (fps)
    zoomFactor: 1.5,           // Fator de zoom para controles do canvas
    maxZoom: 25,               // Zoom máximo permitido
    minZoom: 0.5               // Zoom mínimo permitido
};

// Estado do aplicativo
const APP_STATE = {
    watchId: null,             // ID do watcher de posição
    triangulationIds: [],      // IDs dos watchers de triangulação
    permissionStatus: null,    // Status de permissão do navegador
    currentPosition: null,     // Posição atual
    positionHistory: [],       // Histórico de posições
    positionSamples: [],       // Amostras para cálculo de média
    settings: { ...APP_CONFIG }, // Configurações atuais (cópia do padrão)
    lastUpdateTime: 0,         // Timestamp da última atualização
    updateDelta: 0,            // Tempo entre atualizações
    isTracking: false,         // Estado de rastreamento
    errorState: null,          // Estado de erro
    
    // Dados de visualização
    canvas: {
        context: null,         // Contexto do canvas
        width: 0,              // Largura do canvas
        height: 0,             // Altura do canvas
        zoom: 2,               // Nível de zoom atual
        offset: { x: 0, y: 0 }, // Deslocamento da visualização
        centerPos: null,       // Posição central (referência)
        scale: 0.1,            // Escala de metros para pixels
        lastRender: 0,         // Timestamp da última renderização
        isDragging: false,     // Estado de arraste do canvas
        dragStart: { x: 0, y: 0 }, // Posição inicial do arraste
    }
};

// Elementos DOM
const DOM = {
    // Status e coordenadas
    statusIcon: document.getElementById('status-icon'),
    statusText: document.getElementById('status-text'),
    latitude: document.getElementById('latitude'),
    longitude: document.getElementById('longitude'),
    altitude: document.getElementById('altitude'),
    accuracy: document.getElementById('accuracy'),
    accuracyBar: document.getElementById('accuracy-bar'),
    altitudeAccuracy: document.getElementById('altitude-accuracy'),
    speed: document.getElementById('speed'),
    heading: document.getElementById('heading'),
    timestamp: document.getElementById('timestamp'),
    
    // Visualização
    canvas: document.getElementById('position-canvas'),
    zoomIn: document.getElementById('zoom-in'),
    zoomOut: document.getElementById('zoom-out'),
    resetView: document.getElementById('reset-view'),
    
    // Histórico
    historyTable: document.getElementById('history-table'),
    historyData: document.getElementById('history-data'),
    clearHistory: document.getElementById('clear-history'),
    exportHistory: document.getElementById('export-history'),
    
    // Configurações
    updateInterval: document.getElementById('update-interval'),
    positionFilter: document.getElementById('position-filter'),
    avgSamples: document.getElementById('avg-samples'),
    enableTriangulation: document.getElementById('enable-triangulation'),
    applySettings: document.getElementById('apply-settings'),
    resetSettings: document.getElementById('reset-settings'),
    
    // Modais
    permissionModal: document.getElementById('permission-modal'),
    requestPermission: document.getElementById('request-permission'),
    errorModal: document.getElementById('error-modal'),
    errorMessage: document.getElementById('error-message'),
    errorSolutions: document.getElementById('error-solutions'),
    dismissError: document.getElementById('dismiss-error'),
    
    // Outros
    browserInfo: document.getElementById('browser-info')
};

/**
 * Inicialização do aplicativo
 */
function initApp() {
    // Verificar suporte à geolocalização
    if (!navigator.geolocation) {
        showError('Seu navegador não suporta Geolocalização', [
            'Tente usar um navegador mais recente como Chrome, Firefox, Safari ou Edge',
            'Atualize seu navegador para a versão mais recente',
            'Em dispositivos móveis, tente usar o navegador nativo do sistema'
        ]);
        return;
    }
    
    // Inicializar canvas
    initCanvas();
    
    // Configurar elementos da interface
    setupUIElements();
    
    // Verificar e solicitar permissões
    checkPermissions();
    
    // Mostrar informações do navegador
    displayBrowserInfo();
}

/**
 * Verifica e solicita permissões de geolocalização
 */
function checkPermissions() {
    // Verificar se a API de permissões está disponível
    if (navigator.permissions && navigator.permissions.query) {
        navigator.permissions.query({ name: 'geolocation' })
            .then(permissionStatus => {
                APP_STATE.permissionStatus = permissionStatus.state;
                
                // Monitorar mudanças de permissão
                permissionStatus.onchange = () => {
                    APP_STATE.permissionStatus = permissionStatus.state;
                    handlePermissionChange(permissionStatus.state);
                };
                
                // Processar estado inicial de permissão
                handlePermissionChange(permissionStatus.state);
            })
            .catch(err => {
                // Fallback: tentar iniciar geolocalização diretamente
                console.warn('Não foi possível consultar permissões:', err);
                startGeolocation();
            });
    } else {
        // Navegadores sem suporte à API de permissões
        console.warn('API de permissões não suportada');
        startGeolocation();
    }
}

/**
 * Manipula mudanças no estado de permissão
 * @param {string} state - Estado da permissão ('granted', 'denied', 'prompt')
 */
function handlePermissionChange(state) {
    switch (state) {
        case 'granted':
            hideModal(DOM.permissionModal);
            startGeolocation();
            break;
        case 'prompt':
            showModal(DOM.permissionModal);
            break;
        case 'denied':
            showError('Permissão de geolocalização negada', [
                'Acesse as configurações do navegador para conceder permissão',
                'Verifique as configurações de privacidade do seu dispositivo',
                'Tente recarregar a página e permitir o acesso quando solicitado'
            ]);
            break;
    }
    
    updateStatusIndicator(state);
}

/**
 * Inicia o sistema de geolocalização
 */
function startGeolocation() {
    updateStatusIndicator('connecting');
    DOM.statusText.textContent = 'Conectando...';
    
    try {
        // Limpar observadores anteriores se existirem
        stopGeolocation();
        
        // Iniciar observação contínua de posição
        APP_STATE.watchId = navigator.geolocation.watchPosition(
            handlePositionUpdate,
            handlePositionError,
            GEO_CONFIG
        );
        
        // Iniciar triangulação simulada se habilitada
        if (APP_STATE.settings.enableTriangulation) {
            startTriangulation();
        }
        
        APP_STATE.isTracking = true;
        updateStatusIndicator('online');
        DOM.statusText.textContent = 'Conectado';
    } catch (error) {
        console.error('Erro ao iniciar geolocalização:', error);
        handlePositionError({
            code: 0,
            message: `Erro inesperado: ${error.message || 'Desconhecido'}`
        });
    }
}

/**
 * Para o sistema de geolocalização
 */
function stopGeolocation() {
    if (APP_STATE.watchId !== null) {
        navigator.geolocation.clearWatch(APP_STATE.watchId);
        APP_STATE.watchId = null;
    }
    
    stopTriangulation();
    APP_STATE.isTracking = false;
}

/**
 * Inicia múltiplos observadores para simular triangulação
 * Esta função cria múltiplas instâncias de watchPosition para
 * obter mais amostras e potencialmente melhorar a precisão
 */
function startTriangulation() {
    // Limpar triangulação anterior
    stopTriangulation();
    
    // Criar 3 observadores adicionais com variações nos parâmetros
    // para obter múltiplas leituras e triangular a posição
    for (let i = 0; i < 3; i++) {
        // Variar ligeiramente os parâmetros para obter resultados diferentes
        const config = {
            ...GEO_CONFIG,
            timeout: GEO_CONFIG.timeout + (i * 1000),
            maximumAge: i * 500  // Variar o maximumAge para cada observador
        };
        
        const id = navigator.geolocation.watchPosition(
            (position) => handleTriangulationData(position, i),
            (error) => console.warn(`Erro no observador de triangulação ${i}:`, error),
            config
        );
        
        APP_STATE.triangulationIds.push(id);
    }
}

/**
 * Para todos os observadores de triangulação
 */
function stopTriangulation() {
    if (APP_STATE.triangulationIds.length > 0) {
        APP_STATE.triangulationIds.forEach(id => {
            navigator.geolocation.clearWatch(id);
        });
        APP_STATE.triangulationIds = [];
    }
}

/**
 * Processa dados de um observador de triangulação
 * @param {GeolocationPosition} position - Objeto de posição
 * @param {number} observerId - ID do observador
 */
function handleTriangulationData(position, observerId) {
    // Esta implementação combina múltiplas leituras para refinar a precisão
    // Adicionamos a amostra à matriz de amostras
    APP_STATE.positionSamples.push({
        source: `triangulation-${observerId}`,
        timestamp: position.timestamp,
        coords: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            altitude: position.coords.altitude,
            altitudeAccuracy: position.coords.altitudeAccuracy,
            heading: position.coords.heading,
            speed: position.coords.speed
        }
    });
    
    // Limitamos o número de amostras conforme configuração
    while (APP_STATE.positionSamples.length > APP_STATE.settings.avgSamples) {
        APP_STATE.positionSamples.shift();
    }
    
    // Não atualizamos a interface aqui, apenas acumulamos dados
    // A posição refinada será calculada no próximo handlePositionUpdate
}

/**
 * Calcula a média ponderada das amostras de posição
 * Retorna uma posição refinada com base em múltiplas amostras
 * @returns {Object|null} Coordenadas refinadas ou null se não houver amostras suficientes
 */
function calculateRefinedPosition() {
    const samples = APP_STATE.positionSamples;
    if (samples.length === 0) return null;
    
    // Se temos apenas uma amostra, retornamos ela diretamente
    if (samples.length === 1) return samples[0].coords;
    
    // Pesos: amostras mais recentes e com melhor precisão têm mais peso
    const weights = samples.map(sample => {
        const ageWeight = 1; // Peso da idade (mais recente = mais peso)
        const accuracyWeight = sample.coords.accuracy ? (10 / sample.coords.accuracy) : 1;
        return ageWeight * accuracyWeight;
    });
    
    // Calcular soma dos pesos para normalização
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    
    // Calcular médias ponderadas
    let sumLat = 0, sumLng = 0, sumAlt = 0, sumSpeed = 0, sumHeading = 0;
    let sumAccuracy = 0, sumAltAccuracy = 0;
    let countAlt = 0, countSpeed = 0, countHeading = 0, countAltAccuracy = 0;
    
    samples.forEach((sample, i) => {
        const w = weights[i] / totalWeight; // Peso normalizado
        const coords = sample.coords;
        
        sumLat += coords.latitude * w;
        sumLng += coords.longitude * w;
        sumAccuracy += coords.accuracy * w;
        
        if (coords.altitude !== null) {
            sumAlt += coords.altitude * w;
            countAlt++;
        }
        
        if (coords.speed !== null) {
            sumSpeed += coords.speed * w;
            countSpeed++;
        }
        
        if (coords.heading !== null && !isNaN(coords.heading)) {
            sumHeading += coords.heading * w;
            countHeading++;
        }
        
        if (coords.altitudeAccuracy !== null) {
            sumAltAccuracy += coords.altitudeAccuracy * w;
            countAltAccuracy++;
        }
    });
    
    // Construir objeto refinado
    return {
        latitude: sumLat,
        longitude: sumLng,
        accuracy: sumAccuracy,
        altitude: countAlt > 0 ? sumAlt : null,
        altitudeAccuracy: countAltAccuracy > 0 ? sumAltAccuracy : null,
        heading: countHeading > 0 ? sumHeading : null,
        speed: countSpeed > 0 ? sumSpeed : null
    };
}

/**
 * Manipula atualização de posição
 * @param {GeolocationPosition} position - Objeto de posição
 */
function handlePositionUpdate(position) {
    // Calcular delta de tempo desde a última atualização
    const now = Date.now();
    APP_STATE.updateDelta = APP_STATE.lastUpdateTime > 0 ? now - APP_STATE.lastUpdateTime : 0;
    APP_STATE.lastUpdateTime = now;
    
    // Adicionar à lista de amostras
    APP_STATE.positionSamples.push({
        source: 'primary',
        timestamp: position.timestamp,
        coords: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            altitude: position.coords.altitude,
            altitudeAccuracy: position.coords.altitudeAccuracy,
            heading: position.coords.heading,
            speed: position.coords.speed
        }
    });
    
    // Limitar número de amostras
    while (APP_STATE.positionSamples.length > APP_STATE.settings.avgSamples) {
        APP_STATE.positionSamples.shift();
    }
    
    // Obter posição refinada (média ponderada das amostras)
    const refinedCoords = calculateRefinedPosition();
    
    // Verificar se a posição mudou significativamente
    const shouldUpdate = shouldUpdatePosition(refinedCoords);
    
    if (shouldUpdate) {
        // Atualizar estado atual
        APP_STATE.currentPosition = {
            timestamp: now,
            coords: refinedCoords
        };
        
        // Adicionar ao histórico
        addToHistory(APP_STATE.currentPosition);
        
        // Atualizar interface
        updatePositionUI(APP_STATE.currentPosition);
        
        // Se é a primeira posição, centralizar o canvas
        if (!APP_STATE.canvas.centerPos) {
            APP_STATE.canvas.centerPos = {
                latitude: refinedCoords.latitude,
                longitude: refinedCoords.longitude
            };
            resetCanvasView();
        }
    }
    
    // Sempre atualizamos o status para indicar que o sistema está funcionando
    updateStatusIndicator('online');
}

/**
 * Verifica se a posição deve ser atualizada com base no filtro configurado
 * @param {Object} coords - Coordenadas a serem avaliadas
 * @returns {boolean} True se a posição deve ser atualizada
 */
function shouldUpdatePosition(coords) {
    // Primeira posição, sempre atualiza
    if (!APP_STATE.currentPosition) return true;
    
    // Se o filtro está desativado (0), sempre atualiza
    if (APP_STATE.settings.positionFilter <= 0) return true;
    
    // Calcular distância entre posição atual e nova
    const currentCoords = APP_STATE.currentPosition.coords;
    const distance = calculateDistance(
        currentCoords.latitude, currentCoords.longitude,
        coords.latitude, coords.longitude
    );
    
    // Atualizar apenas se a distância for maior que o filtro
    return distance >= APP_STATE.settings.positionFilter;
}

/**
 * Adiciona uma posição ao histórico
 * @param {Object} position - Posição a ser adicionada
 */
function addToHistory(position) {
    APP_STATE.positionHistory.push({
        ...position,
        id: Date.now() // Identificador único
    });
    
    // Limitar tamanho do histórico
    while (APP_STATE.positionHistory.length > APP_STATE.settings.maxHistoryItems) {
        APP_STATE.positionHistory.shift();
    }
    
    // Atualizar tabela de histórico
    updateHistoryTable();
}

/**
 * Manipula erros de geolocalização
 * @param {GeolocationPositionError} error - Erro de geolocalização
 */
function handlePositionError(error) {
    APP_STATE.errorState = error;
    let errorMsg = 'Erro desconhecido';
    let solutions = [];
    
    switch (error.code) {
        case 1: // PERMISSION_DENIED
            errorMsg = 'Permissão de geolocalização negada pelo usuário';
            solutions = [
                'Verifique as configurações de privacidade do navegador',
                'Permita o acesso à localização nas configurações do site',
                'Em dispositivos móveis, verifique as permissões do aplicativo'
            ];
            break;
        case 2: // POSITION_UNAVAILABLE
            errorMsg = 'Localização indisponível';
            solutions = [
                'Verifique se o GPS ou serviços de localização estão ativados',
                'Em ambientes internos, aproxime-se de janelas ou áreas abertas',
                'Reinicie o dispositivo ou o navegador',
                'Em dispositivos móveis, verifique o modo de economia de energia'
            ];
            break;
        case 3: // TIMEOUT
            errorMsg = 'Tempo esgotado ao obter localização';
            solutions = [
                'Verifique sua conexão com a internet',
                'Tente novamente em um local com melhor sinal GPS',
                'Reinicie o aplicativo',
                'Em dispositivos móveis, desative e reative o GPS'
            ];
            break;
        default:
            errorMsg = `Erro desconhecido: ${error.message || 'Sem detalhes disponíveis'}`;
            solutions = [
                'Recarregue a página',
                'Verifique a compatibilidade do navegador',
                'Tente em um dispositivo ou navegador diferente'
            ];
    }
    
    showError(errorMsg, solutions);
    updateStatusIndicator('offline');
    DOM.statusText.textContent = 'Desconectado';
}

/**
 * Mostra um erro no modal
 * @param {string} message - Mensagem de erro
 * @param {string[]} solutions - Lista de possíveis soluções
 */
function showError(message, solutions = []) {
    DOM.errorMessage.textContent = message;
    
    // Limpar e popular lista de soluções
    DOM.errorSolutions.innerHTML = '';
    solutions.forEach(solution => {
        const li = document.createElement('li');
        li.textContent = solution;
        DOM.errorSolutions.appendChild(li);
    });
    
    showModal(DOM.errorModal);
}

/**
 * Atualiza o indicador de status
 * @param {string} status - Status ('online', 'offline', 'connecting')
 */
function updateStatusIndicator(status) {
    DOM.statusIcon.className = '';
    DOM.statusIcon.classList.add(`status-${status}`);
}

/**
 * Atualiza a interface com os dados de posição
 * @param {Object} position - Objeto de posição
 */
function updatePositionUI(position) {
    const coords = position.coords;
    
    // Formatar latitude e longitude com 8 casas decimais
    DOM.latitude.textContent = coords.latitude.toFixed(8);
    DOM.longitude.textContent = coords.longitude.toFixed(8);
    
    // Formatar altitude com 2 casas decimais (se disponível)
    if (coords.altitude !== null) {
        DOM.altitude.textContent = coords.altitude.toFixed(2);
    } else {
        DOM.altitude.textContent = 'N/D';
    }
    
    // Precisão (accuracy)
    DOM.accuracy.textContent = coords.accuracy.toFixed(2);
    
    // Barra de precisão - Quanto menor o valor, melhor a precisão
    // Escala: 0-100m (valores menores são melhores)
    const accuracyPercentage = Math.max(0, Math.min(100, 100 - (coords.accuracy / 100) * 100));
    DOM.accuracyBar.style.width = `${accuracyPercentage}%`;
    
    // Cores baseadas na precisão
    if (coords.accuracy <= 10) {
        DOM.accuracyBar.style.backgroundColor = 'var(--color-success)';
    } else if (coords.accuracy <= 30) {
        DOM.accuracyBar.style.backgroundColor = 'var(--color-warning)';
    } else {
        DOM.accuracyBar.style.backgroundColor = 'var(--color-danger)';
    }
    
    // Precisão da altitude
    if (coords.altitudeAccuracy !== null) {
        DOM.altitudeAccuracy.textContent = coords.altitudeAccuracy.toFixed(2);
    } else {
        DOM.altitudeAccuracy.textContent = 'N/D';
    }
    
    // Velocidade
    if (coords.speed !== null) {
        DOM.speed.textContent = coords.speed.toFixed(2);
    } else {
        DOM.speed.textContent = 'N/D';
    }
    
    // Direção
    if (coords.heading !== null && !isNaN(coords.heading)) {
        DOM.heading.textContent = Math.round(coords.heading);
    } else {
        DOM.heading.textContent = 'N/D';
    }
    
    // Timestamp
    const date = new Date(position.timestamp);
    DOM.timestamp.textContent = date.toLocaleTimeString();
}

/**
 * Atualiza a tabela de histórico
 */
function updateHistoryTable() {
    // Limpar tabela
    DOM.historyData.innerHTML = '';
    
    // Adicionar linhas em ordem reversa (mais recente primeiro)
    [...APP_STATE.positionHistory]
        .reverse()
        .forEach(entry => {
            const row = document.createElement('tr');
            const coords = entry.coords;
            const date = new Date(entry.timestamp);
            
            // Formatar células
            row.innerHTML = `
                <td>${date.toLocaleTimeString()}</td>
                <td>${coords.latitude.toFixed(8)}</td>
                <td>${coords.longitude.toFixed(8)}</td>
                <td>${coords.accuracy.toFixed(2)} m</td>
                <td>${coords.altitude !== null ? coords.altitude.toFixed(2) + ' m' : 'N/D'}</td>
                <td>${coords.speed !== null ? coords.speed.toFixed(2) + ' m/s' : 'N/D'}</td>
            `;
            
            DOM.historyData.appendChild(row);
        });
}

/**
 * Inicializa o canvas para visualização
 */
function initCanvas() {
    const canvas = DOM.canvas;
    const ctx = canvas.getContext('2d');
    
    // Obter dimensões reais
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    
    APP_STATE.canvas.context = ctx;
    APP_STATE.canvas.width = canvas.width;
    APP_STATE.canvas.height = canvas.height;
    
    // Iniciar loop de renderização
    requestAnimationFrame(renderCanvas);
    
    // Adicionar eventos de interação
    setupCanvasInteraction();
}

/**
 * Configura interações do canvas (zoom, arraste)
 */
function setupCanvasInteraction() {
    const canvas = DOM.canvas;
    
    // Eventos de mouse para arraste
    canvas.addEventListener('mousedown', e => {
        APP_STATE.canvas.isDragging = true;
        APP_STATE.canvas.dragStart = { x: e.clientX, y: e.clientY };
    });
    
    canvas.addEventListener('mousemove', e => {
        if (!APP_STATE.canvas.isDragging) return;
        
        const dx = e.clientX - APP_STATE.canvas.dragStart.x;
        const dy = e.clientY - APP_STATE.canvas.dragStart.y;
        
        APP_STATE.canvas.offset.x += dx / APP_STATE.canvas.zoom;
        APP_STATE.canvas.offset.y += dy / APP_STATE.canvas.zoom;
        
        APP_STATE.canvas.dragStart = { x: e.clientX, y: e.clientY };
    });
    
    canvas.addEventListener('mouseup', () => {
        APP_STATE.canvas.isDragging = false;
    });
    
    canvas.addEventListener('mouseleave', () => {
        APP_STATE.canvas.isDragging = false;
    });
    
    // Eventos de toque para dispositivos móveis
    canvas.addEventListener('touchstart', e => {
        e.preventDefault();
        APP_STATE.canvas.isDragging = true;
        APP_STATE.canvas.dragStart = { 
            x: e.touches[0].clientX, 
            y: e.touches[0].clientY 
        };
    });
    
    canvas.addEventListener('touchmove', e => {
        if (!APP_STATE.canvas.isDragging) return;
        e.preventDefault();
        
        const dx = e.touches[0].clientX - APP_STATE.canvas.dragStart.x;
        const dy = e.touches[0].clientY - APP_STATE.canvas.dragStart.y;
        
        APP_STATE.canvas.offset.x += dx / APP_STATE.canvas.zoom;
        APP_STATE.canvas.offset.y += dy / APP_STATE.canvas.zoom;
        
        APP_STATE.canvas.dragStart = { 
            x: e.touches[0].clientX, 
            y: e.touches[0].clientY 
        };
    });
    
    canvas.addEventListener('touchend', e => {
        e.preventDefault();
        APP_STATE.canvas.isDragging = false;
    });
    
    // Evento de roda para zoom
    canvas.addEventListener('wheel', e => {
        e.preventDefault();
        
        // Determinar direção e aplicar zoom
        const zoomDirection = e.deltaY < 0 ? 1 : -1;
        const zoomFactor = APP_STATE.settings.zoomFactor;
        
        if (zoomDirection > 0) {
            APP_STATE.canvas.zoom = Math.min(APP_STATE.settings.maxZoom, 
                APP_STATE.canvas.zoom * zoomFactor);
        } else {
            APP_STATE.canvas.zoom = Math.max(APP_STATE.settings.minZoom, 
                APP_STATE.canvas.zoom / zoomFactor);
        }
    });
}

/**
 * Renderiza o canvas com os dados de posição
 * @param {number} timestamp - Timestamp de animação
 */
function renderCanvas(timestamp) {
    const canvas = APP_STATE.canvas;
    const ctx = canvas.context;
    const history = APP_STATE.positionHistory;
    const centerPos = canvas.centerPos;
    
    // Limitar taxa de renderização
    if (timestamp - canvas.lastRender < 1000 / APP_STATE.settings.canvasUpdateRate) {
        requestAnimationFrame(renderCanvas);
        return;
    }
    canvas.lastRender = timestamp;
    
    // Limpar canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Verificar se temos dados para renderizar
    if (!centerPos || history.length === 0) {
        // Desenhar mensagem de "sem dados"
        ctx.fillStyle = '#999';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Aguardando dados de posição...', canvas.width / 2, canvas.height / 2);
        requestAnimationFrame(renderCanvas);
        return;
    }
    
    // Desenhar grid
    drawGrid(ctx, canvas);
    
    // Desenhar histórico de posições
    drawPositionHistory(ctx, canvas, history, centerPos);
    
    // Desenhar posição atual
    if (APP_STATE.currentPosition) {
        drawCurrentPosition(ctx, canvas, APP_STATE.currentPosition.coords, centerPos);
    }
    
    // Desenhar informações de escala
    drawScaleInfo(ctx, canvas);
    
    // Continuar loop de animação
    requestAnimationFrame(renderCanvas);
}

/**
 * Desenha a grade de referência no canvas
 * @param {CanvasRenderingContext2D} ctx - Contexto do canvas
 * @param {Object} canvas - Estado do canvas
 */
function drawGrid(ctx, canvas) {
    const gridSize = 20 * canvas.zoom; // Tamanho da célula da grade
    const offsetX = (canvas.offset.x * canvas.zoom) % gridSize;
    const offsetY = (canvas.offset.y * canvas.zoom) % gridSize;
    
    ctx.strokeStyle = 'rgba(200, 200, 200, 0.3)';
    ctx.lineWidth = 1;
    
    // Linhas horizontais
    for (let y = offsetY; y < canvas.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }
    
    // Linhas verticais
    for (let x = offsetX; x < canvas.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }
    
    // Desenhar eixos principais
    const centerX = canvas.width / 2 + canvas.offset.x * canvas.zoom;
    const centerY = canvas.height / 2 + canvas.offset.y * canvas.zoom;
    
    ctx.strokeStyle = 'rgba(100, 100, 100, 0.5)';
    ctx.lineWidth = 2;
    
    // Eixo X
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(canvas.width, centerY);
    ctx.stroke();
    
    // Eixo Y
    ctx.beginPath();
    ctx.moveTo(centerX, 0);
    ctx.lineTo(centerX, canvas.height);
    ctx.stroke();
}

/**
 * Desenha o histórico de posições
 * @param {CanvasRenderingContext2D} ctx - Contexto do canvas
 * @param {Object} canvas - Estado do canvas
 * @param {Array} history - Histórico de posições
 * @param {Object} centerPos - Posição central de referência
 */
function drawPositionHistory(ctx, canvas, history, centerPos) {
    if (history.length < 2) return;
    
    // Configurar estilo para o caminho
    ctx.strokeStyle = 'rgba(0, 102, 204, 0.7)';
    ctx.lineWidth = 2 * canvas.zoom;
    
    // Iniciar caminho
    ctx.beginPath();
    
    // Primeiro ponto
    const firstPos = history[0].coords;
    const firstPoint = convertGeoToCanvas(firstPos.latitude, firstPos.longitude, centerPos, canvas);
    ctx.moveTo(firstPoint.x, firstPoint.y);
    
    // Conectar todos os pontos
    for (let i = 1; i < history.length; i++) {
        const pos = history[i].coords;
        const point = convertGeoToCanvas(pos.latitude, pos.longitude, centerPos, canvas);
        ctx.lineTo(point.x, point.y);
    }
    
    // Desenhar caminho
    ctx.stroke();
    
    // Desenhar pontos do histórico
    history.forEach((entry, index) => {
        const pos = entry.coords;
        const point = convertGeoToCanvas(pos.latitude, pos.longitude, centerPos, canvas);
        
        // Diferentes cores com base na precisão
        let pointColor;
        if (pos.accuracy <= 10) {
            pointColor = 'rgba(40, 167, 69, 0.8)'; // Verde para boa precisão
        } else if (pos.accuracy <= 30) {
            pointColor = 'rgba(255, 193, 7, 0.8)'; // Amarelo para precisão média
        } else {
            pointColor = 'rgba(220, 53, 69, 0.8)'; // Vermelho para baixa precisão
        }
        
        // Primeiro e último pontos são um pouco maiores
        const pointSize = (index === 0 || index === history.length - 1) 
            ? 5 * canvas.zoom 
            : 3 * canvas.zoom;
        
        // Desenhar ponto
        ctx.fillStyle = pointColor;
        ctx.beginPath();
        ctx.arc(point.x, point.y, pointSize, 0, Math.PI * 2);
        ctx.fill();
    });
}

/**
 * Desenha a posição atual
 * @param {CanvasRenderingContext2D} ctx - Contexto do canvas
 * @param {Object} canvas - Estado do canvas
 * @param {Object} position - Posição atual
 * @param {Object} centerPos - Posição central de referência
 */
function drawCurrentPosition(ctx, canvas, position, centerPos) {
    const point = convertGeoToCanvas(position.latitude, position.longitude, centerPos, canvas);
    
    // Desenhar círculo de precisão
    const accuracyRadius = position.accuracy * canvas.scale * canvas.zoom;
    ctx.fillStyle = 'rgba(0, 102, 204, 0.1)';
    ctx.beginPath();
    ctx.arc(point.x, point.y, accuracyRadius, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.strokeStyle = 'rgba(0, 102, 204, 0.5)';
    ctx.lineWidth = 1 * canvas.zoom;
    ctx.beginPath();
    ctx.arc(point.x, point.y, accuracyRadius, 0, Math.PI * 2);
    ctx.stroke();
    
        // Desenhar marcador de posição atual
    const markerSize = 8 * canvas.zoom;
    
    // Círculo externo
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(point.x, point.y, markerSize, 0, Math.PI * 2);
    ctx.fill();
    
    // Círculo interno
    ctx.fillStyle = 'rgba(0, 102, 204, 1)';
    ctx.beginPath();
    ctx.arc(point.x, point.y, markerSize * 0.6, 0, Math.PI * 2);
    ctx.fill();
    
    // Desenhar seta de direção se disponível
    if (position.heading !== null && !isNaN(position.heading)) {
        const headingRad = (position.heading * Math.PI) / 180;
        const headingLength = 20 * canvas.zoom;
        
        ctx.strokeStyle = 'rgba(0, 102, 204, 0.8)';
        ctx.lineWidth = 2 * canvas.zoom;
        ctx.beginPath();
        ctx.moveTo(point.x, point.y);
        ctx.lineTo(
            point.x + Math.sin(headingRad) * headingLength,
            point.y - Math.cos(headingRad) * headingLength
        );
        ctx.stroke();
    }
    
    // Texto de coordenadas
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.font = `${12 * canvas.zoom}px Arial`;
    ctx.textAlign = 'center';
    ctx.fillText(
        `${position.latitude.toFixed(6)}, ${position.longitude.toFixed(6)}`,
        point.x,
        point.y + markerSize * 2.5
    );
}

/**
 * Desenha informações de escala no canvas
 * @param {CanvasRenderingContext2D} ctx - Contexto do canvas
 * @param {Object} canvas - Estado do canvas
 */
function drawScaleInfo(ctx, canvas) {
    const scaleBarWidthMeters = 100; // Escala de 100 metros
    const scaleBarWidthPixels = scaleBarWidthMeters * canvas.scale * canvas.zoom;
    const margin = 20;
    const height = 5;
    
    // Desenhar barra de escala
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(
        canvas.width - margin - scaleBarWidthPixels,
        canvas.height - margin - height,
        scaleBarWidthPixels,
        height
    );
    
    // Linhas nas extremidades
    ctx.fillRect(
        canvas.width - margin - scaleBarWidthPixels,
        canvas.height - margin - height - 5,
        2,
        15
    );
    ctx.fillRect(
        canvas.width - margin,
        canvas.height - margin - height - 5,
        2,
        15
    );
    
    // Texto da escala
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(
        `${scaleBarWidthMeters} m`,
        canvas.width - margin - scaleBarWidthPixels / 2,
        canvas.height - margin - height - 8
    );
    
    // Informação de zoom
    ctx.textAlign = 'left';
    ctx.fillText(
        `Zoom: ${canvas.zoom.toFixed(1)}x`,
        margin,
        canvas.height - margin
    );
}

/**
 * Converte coordenadas geográficas para coordenadas do canvas
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {Object} centerPos - Posição central de referência
 * @param {Object} canvas - Estado do canvas
 * @returns {Object} Coordenadas {x, y} no canvas
 */
function convertGeoToCanvas(lat, lng, centerPos, canvas) {
    // Converter de graus para metros usando a fórmula de Haversine simplificada
    // Em distâncias pequenas, podemos usar aproximações
    const earthRadius = 6371000; // raio da Terra em metros
    
    // Converter diferença de latitude para metros
    const latDiff = (lat - centerPos.latitude) * (Math.PI / 180) * earthRadius;
    
    // Converter diferença de longitude para metros (ajustada pela latitude)
    const lngDiff = (lng - centerPos.longitude) * (Math.PI / 180) * earthRadius *
                  Math.cos(centerPos.latitude * Math.PI / 180);
    
    // Calcular posição no canvas
    const x = canvas.width / 2 + (lngDiff * canvas.scale * canvas.zoom) + (canvas.offset.x * canvas.zoom);
    const y = canvas.height / 2 - (latDiff * canvas.scale * canvas.zoom) + (canvas.offset.y * canvas.zoom);
    
    return { x, y };
}

/**
 * Reseta a visualização do canvas para o estado inicial
 */
function resetCanvasView() {
    APP_STATE.canvas.zoom = 2;
    APP_STATE.canvas.offset = { x: 0, y: 0 };
}

/**
 * Calcula a distância entre dois pontos geográficos usando a fórmula de Haversine
 * @param {number} lat1 - Latitude do ponto 1
 * @param {number} lon1 - Longitude do ponto 1
 * @param {number} lat2 - Latitude do ponto 2
 * @param {number} lon2 - Longitude do ponto 2
 * @returns {number} Distância em metros
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Raio da Terra em metros
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
              Math.sin(dLon/2) * Math.sin(dLon/2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;
    
    return distance;
}

/**
 * Configura os elementos de interface e eventos
 */
function setupUIElements() {
    // Configurar botões de zoom
    DOM.zoomIn.addEventListener('click', () => {
        APP_STATE.canvas.zoom = Math.min(
            APP_STATE.settings.maxZoom,
            APP_STATE.canvas.zoom * APP_STATE.settings.zoomFactor
        );
    });
    
    DOM.zoomOut.addEventListener('click', () => {
        APP_STATE.canvas.zoom = Math.max(
            APP_STATE.settings.minZoom,
            APP_STATE.canvas.zoom / APP_STATE.settings.zoomFactor
        );
    });
    
    DOM.resetView.addEventListener('click', resetCanvasView);
    
    // Configurar botões de histórico
    DOM.clearHistory.addEventListener('click', () => {
        if (confirm('Tem certeza que deseja limpar todo o histórico de posições?')) {
            APP_STATE.positionHistory = [];
            updateHistoryTable();
        }
    });
    
    DOM.exportHistory.addEventListener('click', exportHistoryData);
    
    // Configurar controles de configurações
    DOM.updateInterval.value = APP_STATE.settings.updateInterval;
    DOM.positionFilter.value = APP_STATE.settings.positionFilter;
    DOM.avgSamples.value = APP_STATE.settings.avgSamples;
    DOM.enableTriangulation.checked = APP_STATE.settings.enableTriangulation;
    
    DOM.applySettings.addEventListener('click', applySettings);
    DOM.resetSettings.addEventListener('click', resetSettings);
    
    // Configurar botões de modais
    DOM.requestPermission.addEventListener('click', requestGeolocationPermission);
    DOM.dismissError.addEventListener('click', () => hideModal(DOM.errorModal));
}

/**
 * Solicita permissão de geolocalização
 */
function requestGeolocationPermission() {
    updateStatusIndicator('connecting');
    DOM.statusText.textContent = 'Solicitando permissão...';
    
    navigator.geolocation.getCurrentPosition(
        () => {
            hideModal(DOM.permissionModal);
            startGeolocation();
        },
        (error) => {
            handlePositionError(error);
        },
        GEO_CONFIG
    );
}

/**
 * Aplica as configurações definidas pelo usuário
 */
function applySettings() {
    const newSettings = {
        updateInterval: parseInt(DOM.updateInterval.value, 10),
        positionFilter: parseFloat(DOM.positionFilter.value),
        avgSamples: parseInt(DOM.avgSamples.value, 10),
        enableTriangulation: DOM.enableTriangulation.checked
    };
    
    // Validar valores
    if (newSettings.updateInterval < 500) newSettings.updateInterval = 500;
    if (newSettings.avgSamples < 1) newSettings.avgSamples = 1;
    
    // Atualizar configurações
    APP_STATE.settings = {
        ...APP_STATE.settings,
        ...newSettings
    };
    
    // Reiniciar geolocalização se estiver ativa
    if (APP_STATE.isTracking) {
        stopGeolocation();
        startGeolocation();
    }
    
    // Mostrar mensagem de confirmação
    showNotification('Configurações aplicadas com sucesso');
}

/**
 * Reseta as configurações para os valores padrão
 */
function resetSettings() {
    APP_STATE.settings = { ...APP_CONFIG };
    
    // Atualizar interface
    DOM.updateInterval.value = APP_CONFIG.updateInterval;
    DOM.positionFilter.value = APP_CONFIG.positionFilter;
    DOM.avgSamples.value = APP_CONFIG.avgSamples;
    DOM.enableTriangulation.checked = APP_CONFIG.enableTriangulation;
    
    // Reiniciar geolocalização se estiver ativa
    if (APP_STATE.isTracking) {
        stopGeolocation();
        startGeolocation();
    }
    
    showNotification('Configurações resetadas para os valores padrão');
}

/**
 * Exporta os dados do histórico como CSV
 */
function exportHistoryData() {
    if (APP_STATE.positionHistory.length === 0) {
        showNotification('Não há dados para exportar', 'warning');
        return;
    }
    
    // Construir cabeçalho CSV
    let csv = 'Data,Hora,Latitude,Longitude,Precisão (m),Altitude (m),Precisão Alt. (m),Velocidade (m/s),Direção (°)\n';
    
    // Adicionar cada entrada
    APP_STATE.positionHistory.forEach(entry => {
        const date = new Date(entry.timestamp);
        const dateStr = date.toLocaleDateString();
        const timeStr = date.toLocaleTimeString();
        const coords = entry.coords;
        
        // Formatar linha CSV
        csv += [
            dateStr,
            timeStr,
            coords.latitude.toFixed(8),
            coords.longitude.toFixed(8),
            coords.accuracy.toFixed(2),
            coords.altitude !== null ? coords.altitude.toFixed(2) : 'N/D',
            coords.altitudeAccuracy !== null ? coords.altitudeAccuracy.toFixed(2) : 'N/D',
            coords.speed !== null ? coords.speed.toFixed(2) : 'N/D',
            coords.heading !== null && !isNaN(coords.heading) ? Math.round(coords.heading) : 'N/D'
        ].join(',') + '\n';
    });
    
    // Criar blob e link para download
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    // Nome do arquivo com timestamp
    const now = new Date();
    const fileName = `geotracker_export_${now.getFullYear()}${(now.getMonth()+1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}.csv`;
    
    // Configurar e simular clique no link
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    
    // Limpar
    setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }, 100);
    
    showNotification('Dados exportados com sucesso!');
}

/**
 * Exibe um modal
 * @param {HTMLElement} modal - Elemento do modal a ser exibido
 */
function showModal(modal) {
    modal.classList.add('visible');
}

/**
 * Esconde um modal
 * @param {HTMLElement} modal - Elemento do modal a ser escondido
 */
function hideModal(modal) {
    modal.classList.remove('visible');
}

/**
 * Exibe uma notificação temporária
 * @param {string} message - Mensagem da notificação
 * @param {string} type - Tipo da notificação ('info', 'success', 'warning', 'error')
 */
function showNotification(message, type = 'success') {
    // Verificar se já existe uma notificação
    let notification = document.querySelector('.notification');
    
    if (!notification) {
        // Criar elemento de notificação
        notification = document.createElement('div');
        notification.className = 'notification';
        document.body.appendChild(notification);
    }
    
    // Definir tipo e mensagem
    notification.className = `notification notification-${type} fadeIn`;
    notification.textContent = message;
    
    // Mostrar e ocultar após um tempo
    setTimeout(() => {
        notification.classList.add('fadeOut');
        setTimeout(() => {
            if (document.body.contains(notification)) {
                document.body.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

/**
 * Exibe informações do navegador e dispositivo
 */
function displayBrowserInfo() {
    const nav = navigator;
    const browserInfo = [];
    
    // Navegador e versão
    const userAgent = nav.userAgent;
    let browserName = 'Desconhecido';
    
    if (userAgent.indexOf('Chrome') !== -1) browserName = 'Chrome';
    else if (userAgent.indexOf('Firefox') !== -1) browserName = 'Firefox';
    else if (userAgent.indexOf('Safari') !== -1) browserName = 'Safari';
    else if (userAgent.indexOf('Edge') !== -1) browserName = 'Edge';
    else if (userAgent.indexOf('MSIE') !== -1 || userAgent.indexOf('Trident/') !== -1) browserName = 'Internet Explorer';
    
    browserInfo.push(`Navegador: ${browserName}`);
    
    // Dispositivo móvel ou desktop
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
    browserInfo.push(`Dispositivo: ${isMobile ? 'Mobile' : 'Desktop'}`);
    
    // Suporte a geolocalização
    browserInfo.push(`Geolocalização: ${nav.geolocation ? 'Suportada' : 'Não suportada'}`);
    
    // Suporte a alta precisão (sensores específicos)
    const hasDeviceOrientation = 'DeviceOrientationEvent' in window;
    const hasDeviceMotion = 'DeviceMotionEvent' in window;
    
    if (hasDeviceOrientation || hasDeviceMotion) {
        browserInfo.push('Sensores avançados: Disponíveis');
    }
    
    // Mostrar no footer
    DOM.browserInfo.textContent = browserInfo.join(' | ');
}

/**
 * Adiciona estilos CSS para notificações
 */
function addNotificationStyles() {
    const style = document.createElement('style');
    style.textContent = `
        .notification {
            position: fixed;
            bottom: 20px;
            right: 20px;
            padding: 12px 20px;
            border-radius: var(--radius-medium);
            color: white;
            font-weight: 500;
            box-shadow: var(--shadow-medium);
            z-index: 9999;
            opacity: 0;
        }
        
        .notification-success {
            background-color: var(--color-success);
        }
        
        .notification-warning {
            background-color: var(--color-warning);
            color: #333;
        }
        
        .notification-error {
            background-color: var(--color-danger);
        }
        
        .notification-info {
            background-color: var(--color-info);
        }
        
        .fadeIn {
            animation: fadeIn 0.3s ease forwards;
        }
        
        .fadeOut {
            animation: fadeOut 0.3s ease forwards;
        }
        
        @keyframes fadeOut {
            from { opacity: 1; }
            to { opacity: 0; }
        }
    `;
    
    document.head.appendChild(style);
}

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    addNotificationStyles();
    initApp();
});