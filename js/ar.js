import { facePoint } from './services/face-tracker.js';

// Accessoires de réalité augmentée dessinés en vectoriel (aucune image à charger).
// Chaque accessoire se dessine dans un repère « visage » : l'unité est la distance entre les yeux (D),
// l'axe x suit la ligne des yeux et l'axe y pointe vers le bas du visage, ce qui gère la rotation de la tête.

const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/** Repère visage en coordonnées du canvas. `map` convertit un point normalisé de la caméra en pixels. */
function geometry(face, map) {
    const at = (name) => map(facePoint(face, name));
    const rightEye = lerp(at('rightEyeOuter'), at('rightEyeInner'), 0.5);
    const leftEye = lerp(at('leftEyeOuter'), at('leftEyeInner'), 0.5);
    // « gauche/droite » sont ceux de l'écran (le miroir de la caméra frontale est déjà appliqué par `map`).
    const [a, b] = rightEye.x <= leftEye.x ? [rightEye, leftEye] : [leftEye, rightEye];
    return {
        mid: lerp(a, b, 0.5),
        D: Math.hypot(b.x - a.x, b.y - a.y),
        angle: Math.atan2(b.y - a.y, b.x - a.x),
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
let maskSprite = null;
function getMaskSprite() {
    if (maskSprite) return maskSprite;
    const c = document.createElement('canvas');
    c.width = 400; c.height = 200;
    const x = c.getContext('2d');
    const body = x.createLinearGradient(0, 40, 0, 170);
    body.addColorStop(0, '#2a2a33'); body.addColorStop(1, '#0d0d12');
    x.fillStyle = body;
    for (const cx of [100, 300]) { x.beginPath(); x.ellipse(cx, 104, 118, 78, 0, 0, Math.PI * 2); x.fill(); }
    x.fillRect(150, 52, 100, 62);
    x.globalCompositeOperation = 'destination-out';
    for (const cx of [100, 300]) { x.beginPath(); x.ellipse(cx, 104, 50, 34, 0, 0, Math.PI * 2); x.fill(); }
    maskSprite = c;
    return c;
}

/** @type {Record<string, {label: string, draw: (ctx: CanvasRenderingContext2D, g: ReturnType<typeof geometry>) => void}>} */
export const AR_ACCESSORIES = {
    lunettes: {
        label: 'Lunettes',
        draw(ctx, g) {
            inFrame(ctx, g.mid, g, () => {
                const lens = ctx.createLinearGradient(0, -0.2, 0, 0.3);
                lens.addColorStop(0, '#2b2b35'); lens.addColorStop(1, '#07070b');
                ctx.lineJoin = 'round';
                ctx.strokeStyle = '#050507'; ctx.lineWidth = 0.05;
                ctx.beginPath(); ctx.moveTo(-0.15, -0.03); ctx.quadraticCurveTo(0, -0.12, 0.15, -0.03); ctx.stroke();
                for (const side of [-1, 1]) {
                    ctx.beginPath(); ctx.moveTo(side * 0.86, -0.03); ctx.lineTo(side * 1.3, 0.02); ctx.stroke();
                    roundedRect(ctx, side * 0.5 - 0.37, -0.2, 0.74, 0.5, 0.17);
                    fillStroke(ctx, lens, '#050507', 0.05);
                    ctx.beginPath(); ctx.moveTo(side * 0.5 - 0.22, -0.1); ctx.lineTo(side * 0.5 - 0.06, -0.1);
                    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 0.04; ctx.lineCap = 'round'; ctx.stroke();
                }
            });
        },
    },
    nez: {
        label: 'Nez de clown',
        draw(ctx, g) {
            inFrame(ctx, g.nose, g, () => {
                const ball = ctx.createRadialGradient(-0.07, -0.08, 0.02, 0, 0, 0.26);
                ball.addColorStop(0, '#ff7a7a'); ball.addColorStop(0.45, '#e5262b'); ball.addColorStop(1, '#8e1117');
                ctx.beginPath(); ctx.arc(0, 0, 0.24, 0, Math.PI * 2);
                fillStroke(ctx, ball);
            });
        },
    },
    moustache: {
        label: 'Moustache',
        draw(ctx, g) {
            inFrame(ctx, lerp(g.noseBase, g.upperLip, 0.6), g, () => {
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
            inFrame(ctx, lerp(g.forehead, g.mid, 0.05), g, () => {
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
            inFrame(ctx, lerp(g.forehead, g.mid, 0.08), g, () => {
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
            inFrame(ctx, lerp(g.forehead, g.mid, 0.12), g, () => {
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
            inFrame(ctx, g.mid, g, () => ctx.drawImage(getMaskSprite(), -1.0, -0.52, 2.0, 1.0));
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
