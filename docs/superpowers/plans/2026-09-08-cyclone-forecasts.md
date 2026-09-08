# Intégration des prévisions cycloniques

Objectif : utiliser le catalogue Weather AI, son historique et ses données JSON dans la carte Svelte/MapLibre existante.

- [x] Contrat API et tests : catalogue dynamique, init_time distinct de published_at, sélection par run_id opaque, échéances réellement publiées, identité (membre, trajectoire), erreurs et concurrence.
- [x] État partagé : chargement annulable, conservation de l'échéance entre produits et publications, cache borné, aucun ancien champ affiché sous une nouvelle date.
- [x] Carte : GeoJSON des tracés et positions, traversée de l'antiméridien, champs JSON projetés en raster Mercator, informations de point accessibles, aucun déplacement automatique.
- [x] Interface : panneaux existants desktop/mobile, sélection d'initialisation/publication, frise compacte, chargement/erreur/vide, attribution API intacte.
- [x] Vérification : tests, contrôle TypeScript/Svelte, build, essais navigateur desktop/mobile, plusieurs publications réelles et erreurs simulées.

Référence examinée dans Chrome connecté : Weather Lab, carte plein écran, contrôles repliables à gauche, frise flottante en bas, calendrier d'initialisation distinct, points/traits différenciés. Sur mobile les contrôles sont ramenés à des boutons flottants et la frise occupe la largeur disponible.

Contraintes : libellé « Trajectoires candidates » ; aucune probabilité, statistique d'ensemble, cône ou horizon simulé. Le champ cyclone est affiché comme un signal sans unité et jamais comme un pourcentage. L'historique peut contenir plusieurs publications pour la même initialisation. Les identifiants de runs ne sont jamais parsés pour deviner une date.

## Vérification réalisée les 8–9 septembre 2026

- API réelle : catalogue de 16 publications ; initialisation du 7 septembre à 18 UTC publiée le 8 septembre à 06:36 UTC, trois produits et huit échéances. Les huit réponses de trajectoires sont regroupées par identité (membre, model_track_id), soit 11 candidats pour cette publication.
- Navigation desktop : +48 h conservé entre Trajectoires candidates, Pression et Cyclones ; centre et zoom conservés ; restauration de +48 h au rechargement d'une URL partagée ; couches MapLibre effectivement présentes ; détails pression, vent et position d'un candidat.
- Archive réelle du 30 août à 18 UTC : trois échéances disponibles, repli explicite de +48 h vers +18 h et message d'absence du produit de trajectoires.
- Mobile Chrome à 390 × 844 : panneau de réglages, choix d'initialisation, fermeture du panneau et frise défilante avec bouton actif visible. Taille habituelle du navigateur restaurée après contrôle.
- Réponses interceptées dans le navigateur de test : trajectoires vides avec état explicite, HTTP 503 sur le catalogue avec message et bouton Réessayer, puis récupération des données réelles après suppression de l'interception.
- Tests automatisés : 507 tests dans 57 fichiers ; validation des dates, des identités de membres, des étapes manquantes, des réponses obsolètes, du recalage temporel, des grilles et du relais HTTP. Contrôles Svelte/TypeScript et ESLint des fichiers modifiés.

## Accès API et livraison

L'API ne fournit pas d'en-tête CORS autorisant le front. Le navigateur utilise donc `/api/weather-ai`, avec un relais GET vers l'hôte fixe `portail.chom.engineering`. Le relais est fourni pour Vite (dev/preview), nginx (Docker) et Cloudflare Workers (configuration des assets mise à jour). Aucun cookie ni en-tête d'authentification du navigateur n'est transmis à l'amont. Le frontend ne dépend plus du bucket OM pour enregistrer ce modèle.

L'application est vérifiée localement. Aucun déploiement de production n'a été effectué ; le relais correspondant à l'hébergement doit être livré avec le front.
