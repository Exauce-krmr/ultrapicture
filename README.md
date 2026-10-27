# UltraPicture

Un appareil photo créatif qui tourne directement dans le navigateur : filtres en temps réel, effets déformants, accessoires en réalité augmentée sur ton visage, photo et vidéo.

**Essayer l'application : https://exauce-krmr.github.io/ultrapicture/**

## Ce que tu peux faire
- **Looks et réglages** : noir & blanc, cinéma, vintage, chaud, froid, sépia… avec un curseur d'intensité, plus exposition, contraste, saturation, netteté, vignette, grain.
- **Effets fun** : pixels, glitch, thermique, négatif, duotone, poster, et déformations (miroir, kaléidoscope, loupe, pincement, tourbillon, vagues, fisheye). Touche l'image pour déplacer l'effet.
- **Réalité augmentée** : lunettes, nez de clown, moustache, haut-de-forme, couronne, oreilles de chat et masque de héros qui suivent ton visage.
- **Retirer un effet en un appui** : une pastille « Effet ✕ » s'affiche sur l'image ; touche-la pour le retirer, quel que soit l'onglet ouvert.
- **Photo et vidéo** : minuteur, grille, zoom matériel quand ton téléphone le permet (puis numérique), formats 1:1, 3:4, 9:16, bouton « maintenir pour comparer » avec l'original.
- **Galerie** : tes photos et vidéos restent sur ton appareil. Tu peux les partager ou les télécharger.

## Utiliser l'application
1. Ouvre le lien ci-dessus sur ton téléphone ou ton ordinateur.
2. Autorise l'accès à la caméra quand le navigateur le demande.
3. Choisis un look, un effet ou un accessoire, puis appuie sur le bouton rond.

Tes images ne quittent jamais ton appareil : rien n'est envoyé sur un serveur.

### Installer l'application (optionnel)
- **Android (Chrome)** : menu ⋮ › *Installer l'application*, ou bouton *Installer l'application* dans les Paramètres.
- **iPhone (Safari)** : bouton Partager › *Sur l'écran d'accueil*.

Une fois installée, UltraPicture fonctionne aussi sans connexion.

## Un souci ?
| Problème | Solution |
|---|---|
| La caméra ne démarre pas | Appuie sur *Réessayer*. Vérifie qu'aucune autre application n'utilise la caméra. |
| Caméra bloquée | Android / ordinateur : cadenas à côté de l'adresse › Autorisations › Caméra. iPhone : Réglages › Apps › Safari › Caméra. |
| L'aperçu est lent | Paramètres › Qualité d'aperçu › Économie. |
| Les accessoires AR n'apparaissent pas | Place ton visage face à la caméra, avec assez de lumière. |

---

## Pour les développeurs
Application en JavaScript vanilla (modules ES), sans étape de build. La caméra exige HTTPS ou `localhost` :

    python3 -m http.server 8080      # puis http://localhost:8080

Structure : `index.html`, `css/`, `js/` (`main.js` orchestre ; `pwa.js` et `sw.js` gèrent la PWA), `vendor/mediapipe/` (détection de visage, voir son README), `manifest.webmanifest`, `icons/`.
Tous les chemins sont relatifs : le site fonctionne sous un sous-dossier (GitHub Pages). Après une mise à jour, incrémenter `VERSION` dans `sw.js` pour renouveler le cache des utilisateurs.

Technologies : Canvas 2D, `getUserMedia`, `MediaRecorder`, IndexedDB, Service Worker, [MediaPipe Face Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker) (Apache-2.0).
