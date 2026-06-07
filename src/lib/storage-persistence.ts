/**
 * Demande au navigateur de marquer le stockage de l'origine comme « persistant »
 * (StorageManager.persist). Sans ça, le navigateur peut évincer **tout** le
 * stockage de l'origine (dont le cache de blocs OMfile) sous pression disque,
 * indépendamment du LRU applicatif (`BrowserBlockCache.maxBytes`).
 *
 * Best practice PWA/offline : à appeler une fois au démarrage. Sur Chrome la
 * permission est accordée selon des heuristiques d'engagement (pas de prompt) ;
 * Firefox peut afficher une demande. No-op si l'API est absente (retourne false).
 *
 * @returns `true` si le stockage est (devenu) persistant, `false` sinon.
 */
export async function requestPersistentStorage(): Promise<boolean> {
	if (typeof navigator === 'undefined' || !navigator.storage?.persist) {
		return false;
	}

	try {
		// Si déjà persistant, ne pas re-demander.
		if (navigator.storage.persisted && (await navigator.storage.persisted())) {
			return true;
		}

		const granted = await navigator.storage.persist();
		if (!granted) {
			console.info('[storage] persistance non accordée — cache évinçable sous pression disque');
		}
		return granted;
	} catch (error) {
		console.warn('[storage] échec de la demande de persistance', error);
		return false;
	}
}
