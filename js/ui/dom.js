/** Raccourci querySelector qui échoue bruyamment si l'élément manque (erreur de markup). */
export function $(selector, root = document) {
    const el = root.querySelector(selector);
    if (!el) throw new Error(`Élément introuvable : ${selector}`);
    return el;
}

/**
 * Crée un élément. `props` : attributs/propriétés ; `dataset` et `class` gérés à part.
 * Les enfants texte sont insérés comme texte (jamais interprétés comme HTML).
 */
export function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
        if (value == null || value === false) continue;
        if (key === 'class') node.className = value;
        else if (key === 'dataset') Object.assign(node.dataset, value);
        else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
        else if (key in node) node[key] = value;
        else node.setAttribute(key, value === true ? '' : value);
    }
    node.append(...children.flat().filter((c) => c != null));
    return node;
}
