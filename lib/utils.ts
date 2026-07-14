import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function nowIso() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}
