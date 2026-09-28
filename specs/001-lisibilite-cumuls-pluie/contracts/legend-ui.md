# Contrat UI : légende des précipitations

**Composants** : `src/lib/components/scale/scale.svelte`, et la légende d'export `src/lib/watermark-details.ts`.

## Affichage

| Élément                             | Règle                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Classes                             | 17 cases colorées, plus la case 0 transparente en bas. _Révisé à l'implémentation_ : la légende place ses libellés **aux frontières** entre cases, donc retirer la case 0 ferait disparaître le libellé de la 1re borne (1,5). La case transparente signifie « rien sous la 1re borne », comme l'entrée « ≥ 0 » transparente de la légende radar d'Infoclimat. |
| Libellés                            | « ≥ borne », borne convertie dans l'unité d'affichage (`convertValue`). En mm : 1 décimale si la borne n'est pas entière (« ≥ 1,5 »), sinon entier.                                                                                                                                                                                                            |
| Unité                               | Affichée comme aujourd'hui (mm ou in).                                                                                                                                                                                                                                                                                                                         |
| En-tête de palier (A7)              | « Cumul 24 h » (ou 1 h, 3 h…) pour les variables concernées, visible dès que l'échelle correspond au palier courant. Pour les variables par pas au pas horaire, on affiche « Cumul 1 h ».                                                                                                                                                                      |
| Changement de palier                | Mise à jour dans la même frame que la carte (source : store `precipitationTier`).                                                                                                                                                                                                                                                                              |
| Palette personnalisée               | La légende montre la palette personnalisée, sans en-tête de palier.                                                                                                                                                                                                                                                                                            |
| Réinitialiser aux couleurs standard | Restaure la substitution par palier (research R7).                                                                                                                                                                                                                                                                                                             |
| Édition de couleur                  | Comportement actuel conservé. Éditer une couleur crée une palette personnalisée, qui s'applique alors à tous les paliers.                                                                                                                                                                                                                                      |

## Accessibilité et lisibilité

- Les libellés restent lisibles en largeur mobile (390 px), éventuellement sur 2 lignes ou en réduisant la largeur des cases. On vérifie qu'aucun libellé n'est tronqué avec 17 classes.
- Chaque case a un nom accessible « ≥ X mm ».

## Non-régression

Les variables hors périmètre gardent une légende identique : même composant, même branche de code (C2, règle 3).
