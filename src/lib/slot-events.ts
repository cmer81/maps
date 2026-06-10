/**
 * Shared event bus for SlotManager lifecycle events.
 *
 * `commit` fires after a slot's source is loaded and the cross-fade has been
 * triggered. `error` fires on source load failure. Both managers (raster +
 * vector) dispatch into the same bus.
 *
 * Note : il n'y a plus de consommateur de ce bus depuis le retrait du player
 * d'animation ; l'émission est conservée (inoffensive) pour le futur module
 * d'animation à reconstruire.
 *
 * Multiple subscribers are safe; events are not coalesced.
 */
export const slotEvents = new EventTarget();

export const SLOT_EVENT_COMMIT = 'commit';
export const SLOT_EVENT_ERROR = 'error';
