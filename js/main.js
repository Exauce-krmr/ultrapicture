import { CAMERA_GATES, CONFIG, MESSAGES, PHOTO_FORMATS } from './config.js';
import { Camera, CameraError, queryCameraPermission } from './camera.js';
import { Renderer } from './renderer.js';
import { Recorder, isRecordingSupported } from './recorder.js';
import { CameraScreen } from './ui.js';
import { ToolPanel } from './ui/panels.js';
import { Gallery } from './ui/gallery.js';
import { SettingsView } from './ui/settings-view.js';
import { Toast } from './ui/toast.js';
import { $ } from './ui/dom.js';
import { getEffect } from './filters/index.js';
import { setDistortionCenter } from './filters/distort.js';
import { adjustmentsForLook, getLook, intensityForLook, DEFAULT_ADJUSTMENTS } from './looks.js';
import { SettingsStore } from './services/settings.js';
import { FaceTracker } from './services/face-tracker.js';
import { AR_ACCESSORIES, createFaceOverlay } from './ar.js';
import { MediaStore } from './services/media-store.js';
import { bindBackNavigation } from './ui/back-navigation.js';
import { registerServiceWorker } from './pwa.js';
import { canvasToBlob, exportFile, fileNameFor } from './capture.js';

// ---------- Composition ----------
const video = $('#source');
const settings = new SettingsStore();
const store = new MediaStore();
const toast = new Toast();
const screen = new CameraScreen();
const camera = new Camera();
const renderer = new Renderer(video, $('#preview'));
const recorder = new Recorder();
const faceTracker = new FaceTracker();

const gallery = new Gallery({
    store,
    onChange: (items) => screen.setThumbnail(items[0] ? (items[0].thumb ?? items[0].blob) : null),
    onError: (err) => { console.error('[gallery]', err); toast.show(MESSAGES.STORE_FAILED); },
});

const settingsView = new SettingsView({
    settings,
    actions: {
        onResetSettings: () => settings.reset(),
        onClearGallery: async () => {
            try { await store.clear(); screen.setThumbnail(null); toast.show('Galerie vidée.'); }
            catch (err) { console.error('[store]', err); toast.show(MESSAGES.STORE_FAILED); }
        },
    },
});

function selectLook(id) {
    const look = getLook(id);
    if (look.category === 'fun') toast.show(CONFIG.DISTORT_HINT);
    settings.set({ lookId: id, adjustments: adjustmentsForLook(look), effectIntensity: intensityForLook(look) });
}

const panel = new ToolPanel({
    onLook: selectLook,
    onAr: (id) => setAccessory(id),
    onAdjust: (id, value) => settings.set({ adjustments: { ...settings.get().adjustments, [id]: value } }),
    onIntensity: (value) => settings.set({ effectIntensity: value }),
    onReset: () => settings.set({ lookId: 'original', adjustments: { ...DEFAULT_ADJUSTMENTS }, effectIntensity: 100 }),
});

// ---------- État d'exécution ----------
let mode = 'photo';
let cameraReady = false;
let zoom = 1;
let torchOn = false;
let busy = false;
let cancelCountdown = null;
let recordingTimer = 0;
let arId = null;
let starting = false;
let deniedCount = 0;
let permissionStatus = null;

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const haptic = () => { if (settings.get().haptics) navigator.vibrate?.(CONFIG.HAPTIC_MS); };
const nextFrames = async (n) => { for (let i = 0; i < n; i++) await new Promise(requestAnimationFrame); };
const currentRatio = () => CONFIG.RATIOS.find((r) => r.id === settings.get().ratio) ?? CONFIG.RATIOS[0];
const maxZoom = () => CONFIG.ZOOM_MAX_DIGITAL;

// ---------- Application des réglages à l'affichage ----------
function applyProcessing() {
    const s = settings.get();
    renderer.setProcessing({
        adjustments: s.adjustments,
        effect: getEffect(getLook(s.lookId).effect),
        intensity: s.effectIntensity / 100,
    });
    panel.setState({ lookId: s.lookId, adjustments: s.adjustments, effectIntensity: s.effectIntensity, arId });
    // Pastilles sur l'image : l'effet actif se retire d'un appui, quel que soit l'onglet ouvert.
    const look = getLook(s.lookId);
    screen.setActiveEffects([
        ...(s.lookId !== 'original' ? [{ label: look.label, onClear: () => selectLook('original') }] : []),
        ...(arId ? [{ label: AR_ACCESSORIES[arId].label, onClear: () => setAccessory(null) }] : []),
    ]);
}

function applyDisplay() {
    const s = settings.get();
    screen.setGrid(s.grid);
    screen.setHistogram(s.histogram);
    renderer.setHistogramListener(s.histogram ? (bins) => screen.drawHistogram(bins) : null);
    renderer.setFpsListener(s.showFps ? (fps) => screen.showFps(fps) : null);
    if (!s.showFps) screen.showFps(null);
    renderer.setWidth(recorder.active ? CONFIG.VIDEO_RECORD_WIDTH : CONFIG.PREVIEW_WIDTHS[s.previewQuality]);
    renderer.setMirror(camera.isFront && s.mirrorFront);
    const ratio = currentRatio();
    renderer.setRatio(ratio.value);
    screen.setRatio(ratio);
    screen.setTimer(s.timer);
}

settings.subscribe(() => { applyProcessing(); applyDisplay(); });

// ---------- Réalité augmentée ----------
/** Active (ou retire avec null) un accessoire de visage ; charge MediaPipe à la première utilisation. */
async function setAccessory(id) {
    if (id && !cameraReady) { toast.show(MESSAGES.CAMERA_REQUIRED); return; }
    arId = id;
    renderer.setOverlay(null);
    faceTracker.reset();
    applyProcessing();
    if (!id) { toast.hide(); return; }
    if (!faceTracker.ready) {
        toast.show(MESSAGES.AR_LOADING, 0);
        try {
            await faceTracker.load();
        } catch (err) {
            console.error('[ar] chargement', err);
            if (arId === id) { arId = null; applyProcessing(); }
            toast.show(MESSAGES.AR_FAILED);
            return;
        }
        toast.hide();
    }
    if (arId === id) renderer.setOverlay(createFaceOverlay(faceTracker, video, id)); // ignoré si l'utilisateur a changé d'avis
}

// ---------- Caméra ----------
/** Affiche l'aide adaptée au problème, avec l'action la plus utile (réessayer, ouvrir les réglages…). */
function showCameraProblem(code) {
    // Après un refus répété (ou une permission déjà bloquée), redemander ne sert plus : on guide vers les réglages.
    const blocked = code === 'denied' && (deniedCount >= 2 || permissionStatus?.state === 'denied');
    const gate = CAMERA_GATES[blocked ? 'blocked' : code] ?? CAMERA_GATES.unknown;
    const primary = { label: gate.primary, onClick: () => startCamera() };
    screen.showGate({ title: gate.title, text: gate.text, steps: gate.steps, primary });
}

function setCameraUnavailable(code) {
    cameraReady = false;
    renderer.stop();
    screen.setOffline(true);
    screen.setShutterEnabled(false);
    showCameraProblem(code);
}

/** @param {{silent?: boolean}} options silent : garde l'image affichée pendant le changement (bascule avant/arrière) */
async function startCamera(action = () => camera.start(video), { silent = false } = {}) {
    if (starting) return;
    starting = true;
    cameraReady = false;
    screen.setShutterEnabled(false);
    if (!silent) {
        screen.setOffline(true);
        screen.showGate(CAMERA_GATES.loading);
    }
    try {
        await action();
        deniedCount = 0;
        cameraReady = true;
        torchOn = false;
        screen.setTorch(false);
        screen.hideGate();
        screen.setOffline(false);
        screen.setShutterEnabled(true);
        screen.setTorchAvailable(camera.hasTorch);
        setZoom(1);
        applyDisplay();
        renderer.start();
    } catch (err) {
        console.error('[main] démarrage caméra', err);
        const code = err instanceof CameraError ? err.code : 'unknown';
        if (code === 'denied') deniedCount++;
        setCameraUnavailable(code);
    } finally {
        starting = false;
    }
}

/** Bascule avant/arrière ; si l'autre caméra manque, on revient à la précédente avec un message court. */
async function flipCamera() {
    await startCamera(async () => {
        try {
            await camera.flip(video);
        } catch (err) {
            console.warn('[camera] bascule impossible', err);
            await camera.start(video);
            toast.show(MESSAGES.FLIP_FAILED);
        }
    }, { silent: true });
}

async function onCameraLost() {
    if (recorder.active) await stopRecording();
    setCameraUnavailable('lost');
}

function setZoom(value) {
    zoom = clamp(value, 1, maxZoom());
    // Zoom matériel (optique) tant que la caméra le permet, puis numérique pour le reste : la netteté est gardée au maximum.
    const range = camera.zoomRange;
    const hardware = range ? clamp(zoom, Math.max(1, range.min), range.max) : 1;
    if (range) camera.setZoom(hardware).catch((err) => console.warn('[camera] zoom matériel', err));
    renderer.setZoom(zoom / hardware);
    screen.setZoom(zoom, maxZoom());
}

async function toggleTorch() {
    if (!camera.hasTorch) { toast.show(MESSAGES.TORCH_UNAVAILABLE); return; }
    try {
        await camera.setTorch(!torchOn);
        torchOn = !torchOn;
        screen.setTorch(torchOn);
    } catch (err) {
        console.warn('[camera] flash', err);
        toast.show(MESSAGES.TORCH_UNAVAILABLE);
    }
}

// ---------- Minuteur ----------
/** @returns {Promise<boolean>} true si le décompte est allé au bout, false s'il a été annulé */
function countdown(seconds) {
    return new Promise((resolve) => {
        let remaining = seconds;
        let timeoutId = 0;
        const finish = (completed) => {
            clearTimeout(timeoutId);
            cancelCountdown = null;
            screen.showCountdown(null);
            screen.setBusy(false);
            resolve(completed);
        };
        cancelCountdown = () => finish(false);
        screen.setBusy(true);
        const tick = () => {
            if (remaining === 0) { finish(true); return; }
            screen.showCountdown(remaining--);
            haptic();
            timeoutId = setTimeout(tick, 1000);
        };
        tick();
    });
}

// ---------- Photo ----------
async function capturePhoto() {
    busy = true;
    haptic();
    screen.flash();
    try {
        const s = settings.get();
        const canvas = renderer.snapshot({ width: s.photoWidth, timestamp: s.timestamp });
        const blob = await canvasToBlob(canvas, { format: s.photoFormat, quality: s.jpegQuality });
        const record = { type: 'photo', blob, mime: blob.type || PHOTO_FORMATS[s.photoFormat].mime, width: canvas.width, height: canvas.height, createdAt: Date.now() };
        try {
            await store.add(record);
            screen.setThumbnail(blob);
            toast.show(MESSAGES.PHOTO_SAVED);
        } catch (err) {
            console.error('[store]', err);
            toast.show(MESSAGES.STORE_FAILED);
        }
        if (s.shareAfterCapture) await exportFile(blob, fileNameFor(record.createdAt, record.mime));
    } catch (err) {
        console.error('[capture]', err);
        toast.show(MESSAGES.PHOTO_FAILED);
    } finally {
        busy = false;
    }
}

// ---------- Vidéo ----------
async function makeThumbnail(source) {
    const canvas = document.createElement('canvas');
    canvas.width = CONFIG.VIDEO_THUMB_WIDTH;
    canvas.height = Math.round((CONFIG.VIDEO_THUMB_WIDTH * source.height) / source.width);
    canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvasToBlob(canvas, { format: 'jpeg', quality: 0.8 });
}

async function startRecording() {
    if (!isRecordingSupported()) { toast.show(MESSAGES.VIDEO_UNSUPPORTED); return; }
    busy = true;
    try {
        renderer.setWidth(CONFIG.VIDEO_RECORD_WIDTH);
        await nextFrames(3); // laisse le canvas prendre sa nouvelle taille avant la capture du flux
        const { audioFailed } = await recorder.start(renderer.canvas, { withAudio: settings.get().audio });
        if (audioFailed) toast.show(MESSAGES.AUDIO_UNAVAILABLE);
        screen.setRecording(true);
        haptic();
        recordingTimer = setInterval(() => {
            const ms = recorder.elapsedMs;
            screen.setRecordingTime(ms);
            if (ms >= CONFIG.VIDEO_MAX_SECONDS * 1000) stopRecording();
        }, 250);
    } catch (err) {
        console.error('[recorder] démarrage', err);
        toast.show(MESSAGES.VIDEO_FAILED);
        applyDisplay();
    } finally {
        busy = false;
    }
}

async function stopRecording() {
    if (!recorder.active) return;
    busy = true;
    clearInterval(recordingTimer);
    try {
        const canvas = renderer.canvas;
        const thumb = await makeThumbnail(canvas);
        const { blob, durationMs } = await recorder.stop();
        const record = { type: 'video', blob, thumb, mime: blob.type, width: canvas.width, height: canvas.height, durationMs, createdAt: Date.now() };
        try {
            await store.add(record);
            screen.setThumbnail(thumb);
            toast.show(MESSAGES.VIDEO_SAVED);
        } catch (err) {
            console.error('[store]', err);
            toast.show(MESSAGES.STORE_FAILED);
        }
    } catch (err) {
        console.error('[recorder] arrêt', err);
        toast.show(MESSAGES.VIDEO_FAILED);
    } finally {
        screen.setRecording(false);
        applyDisplay();
        busy = false;
    }
}

// ---------- Déclencheur ----------
async function onShutter() {
    if (!cameraReady) return;
    if (cancelCountdown) { cancelCountdown(); return; }
    if (mode === 'video' && recorder.active) { await stopRecording(); return; }
    if (busy) return;

    const seconds = settings.get().timer;
    if (seconds > 0 && !(await countdown(seconds))) return;
    if (mode === 'video') await startRecording(); else await capturePhoto();
}

// ---------- Cycle de vie et navigation ----------
async function suspend() {
    cancelCountdown?.();
    if (recorder.active) await stopRecording();
    renderer.stop();
    camera.stop();
    cameraReady = false;
}

function cycle(list, current) { return list[(list.indexOf(current) + 1) % list.length]; }

function init() {
    screen.bind({
        onTorch: toggleTorch,
        onGrid: () => settings.set({ grid: !settings.get().grid }),
        onHistogram: () => settings.set({ histogram: !settings.get().histogram }),
        onTimer: () => settings.set({ timer: cycle(CONFIG.TIMER_OPTIONS, settings.get().timer) }),
        onRatio: () => { if (!recorder.active) settings.set({ ratio: cycle(CONFIG.RATIOS.map((r) => r.id), settings.get().ratio) }); },
        onSettings: () => settingsView.open(),
        onShutter,
        onFlip: () => { if (!recorder.active && !busy) flipCamera(); },
        onGallery: () => gallery.open(),
        onMode: (next) => { if (recorder.active || busy) return; mode = next; screen.setMode(mode); },
        onCompare: (on) => renderer.setCompare(on),
        onZoom: setZoom,
        onPoint: (x, y) => {
            if (!getEffect(getLook(settings.get().lookId).effect)?.usesCenter) return;
            setDistortionCenter(x, y);
            renderer.refresh();
        },
    });
    screen.setMode(mode);
    applyProcessing();
    applyDisplay();
    camera.onEnded = onCameraLost;
    queryCameraPermission().then((status) => {
        permissionStatus = status;
        // L'utilisateur autorise la caméra depuis les réglages : on repart sans qu'il ait rien à faire.
        if (status) status.onchange = () => { if (status.state === 'granted' && !cameraReady) startCamera(); };
    });
    startCamera();
    store.list()
        .then((items) => screen.setThumbnail(items[0] ? (items[0].thumb ?? items[0].blob) : null))
        .catch((err) => console.warn('[store] lecture initiale', err));

    // Onglet masqué / app en arrière-plan : on libère la caméra, on la relance au retour.
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) suspend();
        else if (!cameraReady) startCamera();
    });
    bindBackNavigation([
        { root: $('#viewer'), isOpen: () => gallery.isViewerOpen, close: () => gallery.closeViewer() },
        { root: $('#settings-view'), isOpen: () => settingsView.isOpen, close: () => settingsView.close() },
        { root: $('#gallery-view'), isOpen: () => gallery.isOpen, close: () => gallery.close() },
    ]);
    registerServiceWorker();
}

init();
