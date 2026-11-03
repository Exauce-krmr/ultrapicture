import { facePoint } from './services/face-tracker.js';

// Accessoires de réalité augmentée dessinés en vectoriel (aucune image à charger).
// Chaque accessoire se dessine dans un repère « visage » : l'unité est la distance entre les yeux (D),
// l'axe x suit la ligne des yeux et l'axe y pointe vers le bas du visage, ce qui gère la rotation de la tête.

// Largeur de visage (en unités D) pour laquelle les accessoires de tête sont dessinés à l'échelle 1.
const AR_REFERENCE_FACE_W = 1.6;
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/** Repère visage en coordonnées du canvas. `map` convertit un point normalisé de la caméra en pixels. */
function geometry(face, map) {
    const at = (name) => map(facePoint(face, name));
    const rightEye = lerp(at('rightEyeOuter'), at('rightEyeInner'), 0.5);
    const leftEye = lerp(at('leftEyeOuter'), at('leftEyeInner'), 0.5);
    // « gauche/droite » sont ceux de l'écran (le miroir de la caméra frontale est déjà appliqué par `map`).
    const [a, b] = rightEye.x <= leftEye.x ? [rightEye, leftEye] : [leftEye, rightEye];
    const D = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    // Largeurs mesurées sur le visage, exprimées en unités D : les accessoires s'y adaptent au lieu d'avoir une taille fixe.
    const width = (p, q) => Math.hypot(at(p).x - at(q).x, at(p).y - at(q).y) / D;
    const faceW = width('faceRight', 'faceLeft');
    return {
        mid: lerp(a, b, 0.5),
        D,
        angle: Math.atan2(b.y - a.y, b.x - a.x),
        faceW,
        templeW: width('templeA', 'templeB'),
        noseW: width('noseWingA', 'noseWingB'),
        mouthW: width('mouthA', 'mouthB'),
        /** Échelle des accessoires de tête (dessinés pour un visage de largeur AR_REFERENCE_FACE_W). */
        head: clamp(faceW / AR_REFERENCE_FACE_W, 0.8, 2),
        noseBridge: at('noseBridge'),
        nose: at('noseTip'),
        noseBase: at('noseBase'),
        upperLip: at('upperLip'),
        forehead: at('forehead'),
    };
}

/** Exécute `draw` dans le repère visage centré sur `origin`. */
function inFrame(ctx, origin, g, draw) {
    ctx.save();
    ctx.translate(origin.x, origin.y);
    ctx.rotate(g.angle);
    ctx.scale(g.D, g.D);
    draw();
    ctx.restore();
}

function roundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

function fillStroke(ctx, fill, stroke, width) {
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
}

// Masque de héros : dessiné une fois sur un canevas hors écran (les trous des yeux exigent destination-out).
// Échelle du sprite : MASK_PX pixels par unité D ; les yeux sont à ±0,5 D du centre.
const MASK_PX = 240;
const MASK_W = 2.5;
const MASK_H = 1.3;
let maskSprite = null;
function getMaskSprite() {
    if (maskSprite) return maskSprite;
    const c = document.createElement('canvas');
    c.width = MASK_W * MASK_PX; c.height = MASK_H * MASK_PX;
    const x = c.getContext('2d');
    const cy = c.height / 2;
    const eyes = [c.width / 2 - 0.5 * MASK_PX, c.width / 2 + 0.5 * MASK_PX];
    const body = x.createLinearGradient(0, cy - 0.5 * MASK_PX, 0, cy + 0.5 * MASK_PX);
    body.addColorStop(0, '#2a2a33'); body.addColorStop(1, '#0d0d12');
    x.fillStyle = body;
    for (const cx of eyes) { x.beginPath(); x.ellipse(cx, cy, 0.66 * MASK_PX, 0.5 * MASK_PX, 0, 0, Math.PI * 2); x.fill(); }
    x.fillRect(eyes[0], cy - 0.42 * MASK_PX, eyes[1] - eyes[0], 0.6 * MASK_PX);
    x.globalCompositeOperation = 'destination-out';
    for (const cx of eyes) { x.beginPath(); x.ellipse(cx, cy, 0.29 * MASK_PX, 0.2 * MASK_PX, 0, 0, Math.PI * 2); x.fill(); }
    maskSprite = c;
    return c;
}

/** @type {Record<string, {label: string, draw: (ctx: CanvasRenderingContext2D, g: ReturnType<typeof geometry>) => void}>} */
export const AR_ACCESSORIES = {
    lunettes: {
        label: 'Lunettes',
        draw(ctx, g) {
            inFrame(ctx, g.mid, g, () => {
                const arm = Math.max(1.2, g.faceW * 0.58);
                const lens = ctx.createLinearGradient(0, -0.26, 0, 0.36);
                lens.addColorStop(0, '#2b2b35'); lens.addColorStop(1, '#07070b');
                ctx.lineJoin = 'round';
                ctx.strokeStyle = '#050507'; ctx.lineWidth = 0.06;
                ctx.beginPath(); ctx.moveTo(-0.15, -0.03); ctx.quadraticCurveTo(0, -0.13, 0.15, -0.03); ctx.stroke();
                for (const side of [-1, 1]) {
                    ctx.beginPath(); ctx.moveTo(side * 0.93, -0.03); ctx.lineTo(side * arm, 0.03); ctx.stroke();
                    roundedRect(ctx, side * 0.5 - 0.44, -0.25, 0.88, 0.62, 0.2);
                    fillStroke(ctx, lens, '#050507', 0.06);
                    ctx.beginPath(); ctx.moveTo(side * 0.5 - 0.27, -0.12); ctx.lineTo(side * 0.5 - 0.08, -0.12);
                    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 0.05; ctx.lineCap = 'round'; ctx.stroke();
                    ctx.strokeStyle = '#050507'; ctx.lineCap = 'butt';
                }
            });
        },
    },
    nez: {
        label: 'Nez de clown',
        draw(ctx, g) {
            // Le rayon suit la largeur réelle du nez (ailes du nez) pour le recouvrir entièrement.
            const r = clamp(g.noseW * 0.66, 0.3, 0.6);
            inFrame(ctx, lerp(g.nose, g.noseBridge, 0.22), g, () => {
                const ball = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.08, 0, 0, r * 1.05);
                ball.addColorStop(0, '#ff8a8a'); ball.addColorStop(0.45, '#e5262b'); ball.addColorStop(1, '#8e1117');
                ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
                fillStroke(ctx, ball);
                ctx.beginPath(); ctx.ellipse(-r * 0.32, -r * 0.4, r * 0.22, r * 0.14, -0.6, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.fill();
            });
        },
    },
    moustache: {
        label: 'Moustache',
        draw(ctx, g) {
            const k = clamp(g.mouthW * 1.0 / 0.84, 0.9, 1.8); // demi-largeur dessinée : 0,84 D
            inFrame(ctx, lerp(g.noseBase, g.upperLip, 0.6), g, () => {
                ctx.scale(k, k);
                for (const side of [-1, 1]) {
                    ctx.save();
                    ctx.scale(side, 1);
                    ctx.beginPath();
                    ctx.moveTo(0, -0.07);
                    ctx.bezierCurveTo(-0.12, -0.22, -0.4, -0.18, -0.58, 0.0);
                    ctx.bezierCurveTo(-0.76, 0.1, -0.84, -0.06, -0.76, -0.16);
                    ctx.bezierCurveTo(-0.7, 0.3, -0.3, 0.28, 0, 0.1);
                    ctx.closePath();
                    fillStroke(ctx, '#2b1a10');
                    ctx.restore();
                }
            });
        },
    },
    chapeau: {
        label: 'Haut-de-forme',
        draw(ctx, g) {
            inFrame(ctx, lerp(g.forehead, g.mid, 0.1), g, () => {
                ctx.scale(g.head, g.head);
                roundedRect(ctx, -0.56, -1.12, 1.12, 1.1, 0.06);
                fillStroke(ctx, '#17171d');
                ctx.fillStyle = '#b3282d'; ctx.fillRect(-0.56, -0.32, 1.12, 0.17);
                ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(-0.44, -1.04, 0.1, 0.9);
                ctx.beginPath(); ctx.ellipse(0, -0.02, 0.98, 0.15, 0, 0, Math.PI * 2);
                fillStroke(ctx, '#101015');
            });
        },
    },
    couronne: {
        label: 'Couronne',
        draw(ctx, g) {
            inFrame(ctx, lerp(g.forehead, g.mid, 0.1), g, () => {
                ctx.scale(g.head, g.head);
                const gold = ctx.createLinearGradient(0, -0.7, 0, 0);
                gold.addColorStop(0, '#ffe27a'); gold.addColorStop(1, '#c58a12');
                ctx.beginPath();
                ctx.moveTo(-0.7, 0); ctx.lineTo(-0.72, -0.55); ctx.lineTo(-0.36, -0.28); ctx.lineTo(0, -0.74);
                ctx.lineTo(0.36, -0.28); ctx.lineTo(0.72, -0.55); ctx.lineTo(0.7, 0); ctx.closePath();
                fillStroke(ctx, gold, '#8a5d08', 0.03);
                [[-0.72, -0.55, '#e0394a'], [0, -0.74, '#3b82f6'], [0.72, -0.55, '#e0394a']].forEach(([x, y, c]) => {
                    ctx.beginPath(); ctx.arc(x, y, 0.07, 0, Math.PI * 2); fillStroke(ctx, c);
                });
            });
        },
    },
    chat: {
        label: 'Oreilles de chat',
        draw(ctx, g) {
            inFrame(ctx, lerp(g.forehead, g.mid, 0.14), g, () => {
                ctx.scale(g.head, g.head);
                for (const side of [-1, 1]) {
                    ctx.save();
                    ctx.scale(side, 1);
                    ctx.beginPath(); ctx.moveTo(-0.98, 0.1); ctx.lineTo(-0.8, -0.78); ctx.lineTo(-0.2, -0.1); ctx.closePath();
                    fillStroke(ctx, '#2c2c34', '#15151a', 0.03);
                    ctx.beginPath(); ctx.moveTo(-0.84, 0.0); ctx.lineTo(-0.78, -0.55); ctx.lineTo(-0.38, -0.1); ctx.closePath();
                    fillStroke(ctx, '#f4a0b5');
                    ctx.restore();
                }
            });
        },
    },
    masque: {
        label: 'Masque de héros',
        draw(ctx, g) {
            inFrame(ctx, g.mid, g, () => {
                const k = clamp(g.faceW / 2.1, 0.9, 1.5); // le masque suit la largeur du visage
                ctx.drawImage(getMaskSprite(), (-MASK_W / 2) * k, (-MASK_H / 2) * k, MASK_W * k, MASK_H * k);
            });
        },
    },
};

/**
 * Crée l'incrustation à passer au Renderer : elle interroge le suivi de visage puis dessine l'accessoire.
 * @returns {(ctx: CanvasRenderingContext2D, map: (p: {x: number, y: number}) => {x: number, y: number}) => void}
 */
export function createFaceOverlay(tracker, video, accessoryId) {
    const accessory = AR_ACCESSORIES[accessoryId];
    return (ctx, map) => {
        for (const face of tracker.update(video)) accessory.draw(ctx, geometry(face, map));
    };
}
