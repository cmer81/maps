// Config runtime injectée dans window.__OM_CONFIG (lue par src/lib/runtime-env.ts).
//
//   • Déploiement Docker  : ce fichier est RÉGÉNÉRÉ au démarrage du conteneur par
//     docker-entrypoint.d/40-runtime-env.sh (cat >) avec les vraies valeurs d'env.
//   • Déploiement statique (Cloudflare Workers Static Assets, dev local) : ce stub
//     est servi tel quel (config vide) → runtime-env.ts retombe sur les VITE_*
//     inlinés au build.
//
// Sa présence évite surtout, sur un hébergement à fallback SPA
// (not_found_handling = single-page-application) ou en dev, que /runtime-config.js
// renvoie l'index.html → "Uncaught SyntaxError: Unexpected token '<'".
window.__OM_CONFIG = window.__OM_CONFIG || {};
