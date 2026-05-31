import { persisted } from 'svelte-persisted-store';

export const DEFAULT_SHOW_DEPARTMENTS = true;

export const showDepartments = persisted('show_departments', DEFAULT_SHOW_DEPARTMENTS);
