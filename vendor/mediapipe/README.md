# Fichiers MediaPipe (détection de visage pour la réalité augmentée)

| Fichier | Origine | Licence |
|---|---|---|
| `vision_bundle_esm.js` | `@mediapipe/tasks-vision@1.1.1` (npm), copie de `vision_bundle.mjs` sans le commentaire sourceMappingURL | Apache-2.0 |
| `wasm/vision_wasm_internal.{js,wasm}` | `@mediapipe/tasks-vision@1.1.1` (variante SIMD) | Apache-2.0 |
| `face_landmarker.task` | Modèle Face Landmarker de Google (float16, 3 758 596 octets), récupéré dans le paquet npm `@beautinique/frontend-tryon-assets` car le serveur officiel n'était pas accessible. | Apache-2.0 (modèle MediaPipe) |

SHA-256 du modèle : `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff`

Pour utiliser la copie officielle à la place (recommandé si vous voulez une provenance vérifiable) :

    curl -L -o vendor/mediapipe/face_landmarker.task \
      https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task

Le navigateur sans SIMD WebAssembly (très anciens téléphones) n'est pas géré : ajoutez alors `vision_wasm_nosimd_internal.{js,wasm}`.
