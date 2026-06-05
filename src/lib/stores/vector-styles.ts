import { persisted } from 'svelte-persisted-store';

import {
	type ArrowStyle,
	type ContourStyle,
	defaultArrowStyle,
	defaultContourStyle
} from '$lib/vector-styles';

/** Style des isolignes, persisté. */
export const contourStyle = persisted<ContourStyle>('contour-style', defaultContourStyle);

/** Style des flèches de vent, persisté. */
export const arrowStyle = persisted<ArrowStyle>('arrow-style', defaultArrowStyle);
