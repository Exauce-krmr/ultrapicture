/**
 * Fait fermer galerie / visionneuse / paramètres par le bouton « Retour » du navigateur (ou le geste retour d'Android),
 * au lieu de quitter l'application. Chaque vue ouverte correspond à une entrée d'historique.
 * @param {{root: HTMLElement, isOpen: () => boolean, close: () => void}[]} views du plus haut au plus bas
 */
export function bindBackNavigation(views) {
    let depth = 0;       // entrées d'historique que nous avons ajoutées
    let ignorePop = 0;   // popstate provoqués par nos propres history.go()

    const openCount = () => views.filter((v) => v.isOpen()).length;

    const sync = () => {
        const target = openCount();
        while (depth < target) { history.pushState({ ultrapicture: ++depth }, ''); }
        if (depth > target) {
            const diff = depth - target;
            depth = target;
            ignorePop++;
            history.go(-diff);
        }
    };

    const observer = new MutationObserver(sync);
    for (const v of views) observer.observe(v.root, { attributes: true, attributeFilter: ['hidden'] });

    window.addEventListener('popstate', () => {
        if (ignorePop > 0) { ignorePop--; return; }
        if (depth === 0) return;
        depth--;                                  // l'entrée vient d'être consommée par l'utilisateur
        views.find((v) => v.isOpen())?.close();   // ferme la vue la plus haute ; sync() verra depth === ouvertes
    });
}
