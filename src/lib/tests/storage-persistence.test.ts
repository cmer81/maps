import { afterEach, describe, expect, it, vi } from 'vitest';

import { requestPersistentStorage } from '$lib/storage-persistence';

const originalStorage = Object.getOwnPropertyDescriptor(navigator, 'storage');

function setStorage(value: unknown) {
	Object.defineProperty(navigator, 'storage', {
		value,
		configurable: true
	});
}

afterEach(() => {
	if (originalStorage) {
		Object.defineProperty(navigator, 'storage', originalStorage);
	} else {
		setStorage(undefined);
	}
	vi.restoreAllMocks();
});

describe('requestPersistentStorage', () => {
	it("retourne false si l'API StorageManager.persist est absente", async () => {
		setStorage({});
		expect(await requestPersistentStorage()).toBe(false);
	});

	it('retourne true sans re-demander si déjà persistant', async () => {
		const persist = vi.fn().mockResolvedValue(false);
		setStorage({ persisted: vi.fn().mockResolvedValue(true), persist });
		expect(await requestPersistentStorage()).toBe(true);
		expect(persist).not.toHaveBeenCalled();
	});

	it('demande la persistance et retourne le résultat accordé', async () => {
		const persist = vi.fn().mockResolvedValue(true);
		setStorage({ persisted: vi.fn().mockResolvedValue(false), persist });
		expect(await requestPersistentStorage()).toBe(true);
		expect(persist).toHaveBeenCalledOnce();
	});

	it('retourne false quand la persistance est refusée', async () => {
		setStorage({
			persisted: vi.fn().mockResolvedValue(false),
			persist: vi.fn().mockResolvedValue(false)
		});
		expect(await requestPersistentStorage()).toBe(false);
	});

	it('retourne false et ne jette pas si persist() lève', async () => {
		setStorage({
			persisted: vi.fn().mockResolvedValue(false),
			persist: vi.fn().mockRejectedValue(new Error('boom'))
		});
		expect(await requestPersistentStorage()).toBe(false);
	});
});
