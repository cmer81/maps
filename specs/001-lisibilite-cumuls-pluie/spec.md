# Feature Specification : couleurs de précipitations alignées sur l'échelle Infoclimat

**Feature Branch** : aucune branche créée (spec rédigée depuis `main`)

**Created** : 2026-09-28

**Status** : Draft (clarifié le 2026-09-28 : Q1 = A, Q2 = B, Q3 = B)

**Input** : User description : « Améliorer la lisibilité des cartes de précipitations, en particulier les vignettes et la représentation des accumulations. Un retour utilisateur indique que les vignettes pourraient nécessiter un ajustement de taille, de densité ou de valeur maximale affichée. Il suggère aussi que la palette des accumulations pourrait être la véritable cause du problème. »
Précision de la demande (2026-09-28) : l'auteur du retour souhaite que **les couleurs de précipitations de la plateforme modèles (`maps`) s'appuient sur la légende des précipitations d'Infoclimat**.

**Diagnostic détaillé** : [diagnostic.md](./diagnostic.md)
**Captures de référence** (cartes d'observations Infoclimat) : [references/](./references/)

> **Révision 3 (2026-09-28), changement de cap décidé après essai en local.** L'utilisateur trouve la palette dérivée d'Infoclimat moins jolie que l'ancienne rampe `maps`. Le besoin réel est de **différencier les paliers jusqu'à 600 mm**. Décisions :
>
> - une **seule échelle fixe**, de 0,2 à 600 mm (18 paliers), pour `precipitation`, `rain`, `showers` et `precipitation_sum` ;
> - la **rampe de l'ancienne échelle `maps`**, prolongée par magenta et violets, puis **lilas et blanc rosé** pour 500 et 600 mm (variante B). La variante A, qui finissait en violets foncés, avait ses trois derniers paliers indiscernables (ΔE00 6-8).
>
> **Abandonnés** : les paliers de bornes par durée (Q1), l'alignement sur les bornes et couleurs Infoclimat (Q3), le critère SC-002 reformulé et l'en-tête « Cumul N h ». **Conservés** : la classe 0 transparente (voile à H0 corrigé), les vignettes au dixième sans « 0 » en zone sèche (US4), la non-régression des autres couches (US5). Les sections ci-dessous sont gardées pour l'historique de la décision.

## Contexte

La plateforme modèles et les cartes d'observations d'Infoclimat affichent les mêmes phénomènes avec deux codes couleur différents. Un utilisateur qui passe de l'une à l'autre (prévision puis observé) doit réapprendre les couleurs : un même cumul n'y a pas la même teinte.

**Aujourd'hui dans `maps`**

- **Précipitations par pas de temps** (`precipitation`, ainsi que `rain`, `showers` et `snowfall_water_equivalent`, qui reprennent la même échelle) :
  - échelle par défaut d'Open-Meteo ;
  - 15 classes de 0,01 à 30 mm ;
  - rampe bleu nuit → bleus → verts → jaunes → rouges.
- **Cumul depuis le début du run** (`precipitation_sum`) :
  - échelle maison, 12 classes de 1 à 300 mm ;
  - même logique de rampe que l'échelle Open-Meteo.
- **Cumuls de grésil et de neige en équivalent eau** (`graupel_sum`, `snow_graupel_sum`, `snowfall_water_equivalent_sum`) : échelle horaire d'Open-Meteo, qui sature à 30 mm.
- **« Vignettes »** : sur `maps`, ce sont les étiquettes « Valeurs » affichées aux points de grille.
  - Texte de 11 px avec un halo, sans fond coloré.
  - Espacement visé d'environ 48 px à l'écran, chevauchement autorisé.
  - Valeurs **arrondies à l'unité**.
  - Conséquence pour la pluie : 0,3 mm s'affiche « 0 », et les zones sèches se couvrent de « 0 ».

**Référence Infoclimat**

- Une seule suite de 17 couleurs, déclinée en jeux de bornes selon la durée du cumul :
  - 1 h : 1,5 à 150 mm ;
  - 3 h : 2 à 250 mm ;
  - 6 h : 3 à 400 mm ;
  - 12 h : 4,5 à 550 mm ;
  - 24 h : 5,5 à 700 mm ;
  - 48 h : 6,5 à 800 mm ;
  - 72 h : 7,5 à 900 mm.
- Aplats discrets.
- Valeurs de stations arrondies à 0,1 mm.

**Point d'attention.** Mesurée objectivement, la palette Infoclimat a elle-même deux défauts de lisibilité (diagnostic §2) :

- les classes intermédiaires sont très claires et proches ;
- un faible cumul (le bleu de la 2e classe) est aussi sombre qu'un cumul extrême.

La reprendre à l'identique apporterait la **cohérence** avec Infoclimat, pas automatiquement la **lisibilité**.

**Décision Q3** : `maps` utilise une **palette dérivée** de celle d'Infoclimat. Elle garde :

- le même nombre de classes et les mêmes bornes par durée ;
- la même progression de teintes (bleus → verts → jaunes → oranges → rouges → bordeaux).

Les couleurs des classes fautives sont corrigées pour atteindre les critères de lisibilité.

## User Scenarios & Testing _(mandatory)_

### User Story 1 : Retrouver les couleurs d'Infoclimat sur les cartes modèles (Priority: P1)

Un habitué d'Infoclimat ouvre la carte de précipitations d'un modèle. Il y retrouve les couleurs des cartes d'observations : même teinte pour une même quantité sur une même durée. Il interprète la prévision sans réapprendre de code couleur.

**Why this priority** : c'est la demande explicite de l'auteur du retour.

**Independent Test** : afficher côte à côte la carte d'observation Infoclimat « pluie 1 h » (ou « 24 h ») et la carte `maps` de même durée. Pour chaque borne de l'échelle Infoclimat, vérifier deux points :

- `maps` change de classe à la même borne ;
- la couleur appartient à la même famille de teinte (bleu, vert, jaune, orange, rouge, bordeaux).

**Acceptance Scenarios** :

1. **Given** une carte de précipitations horaires sur `maps`, **When** une maille vaut X mm, **Then** elle est dans la même classe que sur la carte Infoclimat « pluie 1 h », avec une couleur de la même famille de teinte.
2. **Given** la carte du cumul depuis le début du run, **When** l'utilisateur regarde une échéance donnée, **Then** les bornes sont celles de l'échelle Infoclimat dont la durée correspond au temps écoulé depuis le début du run (voir FR-002).
3. **Given** une valeur supérieure à la dernière borne, **When** elle est affichée, **Then** elle prend la couleur de la classe la plus haute.

---

### User Story 2 : Distinguer faibles et forts cumuls, et les plages entre elles (Priority: P1)

Lors d'un épisode méditerranéen, l'utilisateur repère d'un coup d'œil les zones de faible pluie, de pluie modérée et les cumuls exceptionnels. Deux plages voisines ne se confondent pas.

**Why this priority** : c'est le cœur du retour sur la lisibilité. C'est ce qui justifie la palette dérivée (Q3 = B).

**Independent Test** : sur deux cas d'épisodes intenses (voir Assumptions), faire classer 10 points par des testeurs à l'aide de la légende.

**Acceptance Scenarios** :

1. **Given** une carte comportant à la fois des cumuls de 3 mm et de 100 mm, **When** l'utilisateur la regarde sans légende, **Then** la zone à 100 mm paraît « plus forte ».
2. **Given** deux zones dans des classes voisines, **When** l'utilisateur les compare, **Then** il les distingue sans hésiter (SC-002).

---

### User Story 3 : Une légende qui parle le même langage (Priority: P1)

La légende de `maps` affiche les classes de l'échelle Infoclimat. Chaque classe montre sa couleur, sa borne (« ≥ valeur », comme sur Infoclimat) et l'unité. Elle change quand la durée de cumul change.

**Why this priority** : sans légende alignée, la cohérence des couleurs ne se vérifie pas.

**Independent Test** : comparer la légende `maps` à l'échelle Infoclimat de même durée.

**Acceptance Scenarios** :

1. **Given** une variable de précipitations, **When** la légende est affichée, **Then** elle liste exactement les classes de l'échelle retenue, avec leurs bornes et l'unité.
2. **Given** l'utilisateur a choisi les pouces comme unité, **When** la légende est affichée, **Then** les bornes sont converties, et les couleurs restent attachées aux mêmes quantités physiques.

---

### User Story 4 : Des vignettes de valeurs utiles et lisibles (Priority: P2)

Avec l'option « Valeurs » activée sur une carte de précipitations, l'utilisateur lit des valeurs pertinentes :

- pas de « 0 » à perte de vue ;
- pas de faibles pluies arrondies à 0 ;
- aucun chevauchement ;
- texte lisible sur toutes les couleurs de la nouvelle palette.

**Why this priority** : c'est la partie « vignettes » du retour. Elle dépend de la palette retenue en US1 et US2, puisque le texte doit ressortir sur ces couleurs.

**Independent Test** : activer « Valeurs » sur un épisode pluvieux aux zooms 5, 7, 9 et 11. Compter les chevauchements et vérifier le format des valeurs.

**Acceptance Scenarios** :

1. **Given** une maille à 0,4 mm, **When** sa vignette est affichée, **Then** elle indique une valeur non nulle, au dixième de mm.
2. **Given** une zone sans pluie, **When** « Valeurs » est actif, **Then** les mailles nulles n'affichent pas de vignette (A3).
3. **Given** des valeurs à 3 chiffres ou plus (par exemple « 152,4 »), **When** elles sont affichées côte à côte, **Then** aucune ne recouvre sa voisine.
4. **Given** n'importe quelle couleur de la palette sous la vignette, **When** elle est affichée, **Then** le texte reste lisible (SC-004).

---

### User Story 5 : Les autres couches ne bougent pas (Priority: P3)

Températures, vent, pression, nébulosité, neige en cm, réflectivité radar, type de précipitations, etc. gardent exactement leur rendu. Les vignettes de ces variables gardent aussi leur format actuel (arrondi à l'unité).

**Why this priority** : contrainte de non-régression.

**Independent Test** : comparer des captures avant et après sur un jeu fixe de variables non pluviométriques.

**Acceptance Scenarios** :

1. **Given** la carte de température à 2 m d'un run fixé, **When** on la compare avant et après la livraison, **Then** le rendu est identique, légende et vignettes comprises.

### Edge Cases

- **Pas de temps différent de 1 h**. Les données peuvent avoir un pas de 15 min (AROME HD 15 min) ou de 3 h / 6 h aux longues échéances de certains modèles globaux. Faut-il appliquer l'échelle « 1 h », ou l'échelle de la durée réelle du pas ? Hypothèse par défaut : échelle de la durée réelle quand Infoclimat en a une ; pour 15 min, échelle « 1 h ».
- **Cumul du run à H0** : 0 partout, donc aucune couleur.
- **Cumul du run au-delà de 72 h** (modèles à longue échéance) : faute d'échelle Infoclimat plus longue, on garde l'échelle 72 h.
- **Changement d'échelle pendant l'animation du cumul du run** : les bornes changent quand l'échéance franchit une durée palier.
  - Paliers : 1, 3, 6, 12, 24, 48 et 72 h. Une échéance entre deux paliers prend l'échelle du palier **supérieur ou égal** (A6).
  - La légende MUST changer en même temps que la carte. L'utilisateur doit pouvoir voir que l'échelle a changé (A7).
- **Pas de temps et heure de début de run** : la durée du cumul se mesure depuis le début du run, pas depuis minuit.
- **Valeurs sous la première borne** : 0 < v < 1,5 mm en 1 h, par exemple. Elles restent transparentes, comme sur Infoclimat, et la vignette affiche quand même la valeur.
- **Fond de carte clair ou sombre** : l'échelle Infoclimat n'a pas de variante sombre. Les couleurs doivent rester lisibles, et la classe la plus claire visible, sur le fond sombre.
- **Opacité réglée par l'utilisateur** : l'ordre des classes doit rester perceptible à opacité réduite.
- **Palettes personnalisées** : un utilisateur qui avait personnalisé la palette de pluie conserve sa personnalisation. « Réinitialiser aux couleurs standard » applique la nouvelle palette.
- **Liens partagés et exports PNG** : ils utilisent la nouvelle palette. Aucun paramètre d'URL n'est cassé.
- **Neige en cm** (`snowfall_sum`) : hors périmètre (ce n'est pas une lame d'eau). Pour les cumuls de grésil ou de neige en équivalent eau (mm), voir Assumptions.

## Requirements _(mandatory)_

### Functional Requirements

**Palette et échelle**

- **FR-001** : Les variables de précipitations exprimées en mm par pas de temps MUST utiliser la suite de couleurs Infoclimat, avec les bornes Infoclimat de la durée correspondante (1 h par défaut).
- **FR-002** : Le cumul depuis le début du run MUST utiliser les bornes Infoclimat qui correspondent à la durée écoulée depuis le début du run.
  - Paliers : 1, 3, 6, 12, 24, 48 et 72 h.
  - Au-delà de 72 h, l'échelle 72 h s'applique.
  - Règle de sélection entre deux paliers : A6. (Décision Q1 = A.)
- **FR-003** : Les classes MUST être rendues en aplats discrets, sans dégradé entre bornes, comme sur Infoclimat.
- **FR-004** : Toute valeur au-dessus de la dernière borne MUST prendre la couleur de la classe la plus haute. Toute valeur sous la première borne MUST rester transparente.
- **FR-005** : La palette MUST être dérivée de celle d'Infoclimat. (Décision Q3 = B.)
  - Elle garde les mêmes classes, les mêmes bornes par durée, le même ordre de teintes et la même famille de teinte pour chaque rang.
  - Seules les couleurs nécessaires pour satisfaire FR-006 sont modifiées.
  - Chaque écart par rapport à Infoclimat MUST être documenté, rang par rang.
- **FR-006** : _(amendé au plan et validé le 2026-09-28, voir research R1)_
  - Deux classes voisines, ou séparées d'un seul rang, MUST être distinguables.
  - Les faibles classes (rangs 1 à 4) MUST NOT être plus sombres que les classes fortes.
  - La clarté MUST décroître du jaune (rang 10) aux cumuls extrêmes (SC-002).
  - Le cas du rang 2, bleu sombre aux faibles valeurs, est à corriger en priorité.

**Légende**

- **FR-007** : La légende MUST lister toutes les classes de l'échelle affichée, avec leur couleur, leur borne inférieure et l'unité.
- **FR-008** : La légende MUST suivre la durée de l'échelle utilisée : pas de temps de la donnée, ou palier d'échéance pour le cumul du run (FR-002).
- **FR-009** : La légende MUST convertir les bornes dans l'unité choisie (mm ou pouces) sans changer la correspondance entre couleurs et quantités physiques.

**Vignettes (option « Valeurs »)**

- **FR-010** : Les vignettes des variables de précipitations MUST afficher les valeurs au dixième de mm.
  - Une valeur non nulle ne MUST jamais s'afficher « 0 ».
  - L'option « arrondir à l'unité » est à envisager en complément (A1).
- **FR-011** : Les mailles à 0 mm MUST NOT afficher de vignette pour les variables de précipitations (A3).
- **FR-012** : Les vignettes MUST NOT se chevaucher, quelle que soit la longueur des valeurs, aux zooms où elles sont affichées.
- **FR-013** : Le texte des vignettes MUST rester lisible sur chacune des couleurs de la palette retenue, en thème clair comme en thème sombre.
- **FR-014** : Le format et la densité des vignettes des autres variables MUST rester inchangés.

**Périmètre et compatibilité**

- **FR-015** : Le rendu, la légende et les vignettes des variables non pluviométriques MUST rester inchangés.
- **FR-016** : Les palettes personnalisées existantes MUST être conservées. La référence « couleurs standard » MUST devenir la nouvelle palette.
- **FR-017** : Les variables concernées MUST être `precipitation`, `precipitation_sum`, `rain` et `showers`, sur tous les domaines qui les exposent. (Décision Q2 = B.)
  - Les autres variables en mm gardent leur échelle actuelle : `snowfall_water_equivalent`, `graupel_sum`, `snow_graupel_sum`, `snowfall_water_equivalent_sum`.

### Key Entities

- **Suite de couleurs Infoclimat** : 17 couleurs ordonnées, partagées par toutes les durées. Valeurs exactes dans le diagnostic.
- **Jeu de bornes par durée** : seuils en mm associés aux couleurs, pour 1, 3, 6, 12, 24, 48 et 72 h, avec une classe « au-delà ».
- **Variable de précipitations** : variable en mm, décrite par un type (par pas de temps ou cumul depuis le début du run) et une durée (pas de temps ou échéance).
- **Vignette de valeur** : étiquette posée à un point de grille, avec sa valeur formatée, sa règle d'affichage (masquage des 0) et sa lisibilité sur le fond.

## Success Criteria _(mandatory)_

Protocole commun :

- **Cas de test** : deux épisodes intenses (par exemple les runs couvrant le 17/10/2024 et le 22/12/2025, s'ils sont disponibles) et un jour de pluie faible.
- **Zooms** : 5, 7, 9 et 11.
- **Thèmes** : clair et sombre.
- **Écrans** : ordinateur et mobile.

### Measurable Outcomes

- **SC-001 (cohérence avec Infoclimat)** : pour chaque durée, 100 % des bornes de `maps` sont identiques à celles d'Infoclimat.
  - Chaque rang garde la même famille de teinte.
  - 100 % des écarts de couleur sont documentés, avec la couleur Infoclimat, la couleur `maps` et la raison.
  - Au moins 4 utilisateurs sur 5, habitués d'Infoclimat, jugent les deux cartes « du même code couleur » en comparaison côte à côte.
- **SC-002 (distinction des plages)** : critère **bloquant**, vérifié par calcul sur la palette. _(amendé au plan et validé le 2026-09-28)_
  - L'écart de couleur perçu (CIEDE2000) atteint au moins 10 entre classes voisines **et** entre classes séparées d'un rang.
  - Clarté L* ≥ 70 pour les rangs 1 à 4.
  - Clarté non croissante du rang 10 au rang 17.
  - Mesure actuelle de la palette Infoclimat : deux paires voisines sous 6, et un rang 2 à L* 33.
  - La palette candidate du plan satisfait ces trois conditions : ΔE00 min 10,0 sur toutes les paires.
  - Pourquoi le critère initial a été abandonné : une clarté monotone sur toute la rampe est infaisable avec les familles de teinte Infoclimat (research R1).
- **SC-003 (faibles et forts cumuls)** : au moins 90 % des testeurs (panel ≥ 5) classent correctement au moins 8 points sur 10 avec la légende. Aucune confusion entre un point < 5 mm et un point > 50 mm en 1 h, ou entre équivalents d'autres durées.
- **SC-004 (lisibilité des vignettes)** : le contraste entre le texte de la vignette (avec son halo) et chaque couleur de la palette atteint au moins 4,5:1, dans les deux thèmes.
- **SC-005 (valeurs)** : sur un jeu de valeurs de test (0 ; 0,1 ; 0,4 ; chaque borne ; borne haute + 1 ; 1 000 mm), aucune valeur non nulle ne s'affiche « 0 », 0 n'affiche pas de vignette, et chaque valeur a la couleur attendue.
- **SC-006 (absence de surcharge)** : 0 paire de vignettes qui se chevauchent à chaque zoom testé, y compris pour des valeurs de 5 caractères (« 152,4 »).
- **SC-007 (légende)** : sur 100 % des variables de précipitations, la légende correspond classe par classe à l'échelle affichée, bornes et unité comprises.
- **SC-008 (non-régression)** : captures identiques pixel pour pixel avant et après pour température, vent, pression et nébulosité, sur 3 runs fixés.
- **SC-009 (retour utilisateur)** : l'auteur du retour juge que les couleurs `maps` « correspondent » à celles d'Infoclimat et que la carte d'un épisode intense est « plus lisible » qu'avant.

## Questions ouvertes et arbitrages à valider avant l'implémentation

**Décisions prises** (2026-09-28)

- **Q1 = A** : pour le cumul du run, les bornes suivent l'échéance (1 h, 3 h, 6 h, 12 h, 24 h, 48 h, 72 h). Changer de couleur d'un palier à l'autre pendant l'animation est accepté.
- **Q2 = B** : les variables concernées sont `precipitation`, `precipitation_sum`, `rain` et `showers`.
- **Q3 = B** : palette dérivée d'Infoclimat, avec les mêmes bornes et familles de teintes, et des couleurs corrigées pour la lisibilité. Une éventuelle proposition au site Infoclimat est hors périmètre.

**Arbitrages non bloquants** (proposition par défaut entre parenthèses)

- **A1** : format des vignettes de pluie (1 décimale sous 10 mm, entier au-delà, pour limiter la largeur).
- **A2** : pas de temps différent de 1 h. 15 min : échelle 1 h, ou échelle dédiée à dériver (1 h). 3 h / 6 h : échelle Infoclimat correspondante (oui).
- **A3** : masquage des vignettes à 0 mm, et éventuellement sous un seuil de trace de 0,1 mm (masquer 0 seulement).
- **A4** : moyen anti-chevauchement des vignettes : espacement augmenté pour les variables à valeurs longues, ou détection de collision (espacement adaptatif, qui garde la grille figée et régulière).
- **A5** : rendu sur fond sombre de la classe la plus claire (183,218,226), qui peut disparaître (léger contour ou opacité, à valider en maquette).
- **A6** : sélection du palier pour une échéance située entre deux paliers, par exemple 18 h. Palier supérieur ou égal (24 h), qui correspond au cumul affiché ; ou palier le plus proche (palier supérieur ou égal, pour que la classe la plus haute ne sature pas trop tôt).
- **A7** : signalement du changement d'échelle pendant l'animation (durée de l'échelle affichée dans l'en-tête de la légende, par exemple « échelle 24 h »).
- **A8** : _(remplacé au plan)_ il n'y a plus de tolérance de monotonie. SC-002 reformulé l'intègre (rangs 1 à 4 clairs, décroissance à partir du rang 10).

**Informations manquantes**

- **I1** : le verbatim du retour utilisateur, en particulier ce qu'il entend par « valeur maximale affichée » (plafond de l'échelle ? valeur max des vignettes ?).
- **I2** : des captures `maps` actuelles des deux épisodes de référence, si des runs sont disponibles, pour le comparatif avant/après.

## Assumptions

- **Utilisateurs cibles** : utilisateurs de la plateforme modèles Infoclimat, souvent habitués des cartes d'observations du site.
- **Source de vérité** : les fichiers de palette `radar{1h,3h,6h,12h,24h,48h,72h}.cpt` du site Infoclimat, relevés le 2026-09-28. L'échelle d'intensité radar 5 min (`radaric`) et la « lame d'eau » Météo-France sont hors périmètre.
- **Site Infoclimat** : il n'est pas modifié par cette feature. Proposer la palette corrigée au site ferait l'objet d'une démarche séparée.
- **Variables concernées** : `precipitation`, `precipitation_sum`, `rain` et `showers` (Q2).
  - `snowfall_water_equivalent`, `graupel_sum`, `snow_graupel_sum` et `snowfall_water_equivalent_sum` gardent leur échelle actuelle.
  - Leur éventuel alignement fera l'objet d'une itération ultérieure.
- **Autres variables** : la neige en cm, la réflectivité radar, le type de précipitations et la probabilité de précipitations gardent leur échelle.
- **Données** : les valeurs affichées restent inchangées (pas de lissage ni d'écrêtage). Seules la représentation et le format des vignettes changent.
- **Plafond d'échelle** : en l'absence de précision (I1), la « valeur maximale affichée » est comprise comme le plafond de l'échelle. Celui d'Infoclimat (150 mm en 1 h, 700 mm en 24 h) remplace les plafonds actuels (30 mm par pas, 300 mm pour le cumul du run).
- **Constitution** : la constitution du projet (`.specify/memory/constitution.md`) n'est pas renseignée. Aucune contrainte de gouvernance supplémentaire n'a été appliquée.
