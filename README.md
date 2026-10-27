# UltraPicture

Appareil photo créatif (PWA) : filtres en temps réel, effets déformants, réalité augmentée (MediaPipe), photo et vidéo, galerie locale. JavaScript vanilla, aucune étape de build.

## Lancer en local
La caméra exige HTTPS ou `localhost` :

    python3 -m http.server 8080
    # puis http://localhost:8080

## Publier sur GitHub Pages
1. Créer un dépôt GitHub et y pousser **le contenu de ce dossier** (à la racine du dépôt).
2. Settings › Pages › Source : *Deploy from a branch*, branche `main`, dossier `/ (root)`.
3. Ouvrir `https://<utilisateur>.github.io/<dépôt>/` sur le téléphone.
4. Installer : Chrome/Android › menu › *Installer l'application* (ou bouton dans Paramètres) ; iPhone › Partager › *Sur l'écran d'accueil*.

Tous les chemins sont relatifs : l'application fonctionne sous un sous-dossier. Après une mise à jour, incrémenter `VERSION` dans `sw.js`.

## Structure
- `index.html`, `css/`, `js/` : application (`js/main.js` orchestre ; `js/pwa.js` et `sw.js` : PWA)
- `vendor/mediapipe/` : détection de visage (voir son README)
- `manifest.webmanifest`, `icons/` : installation
