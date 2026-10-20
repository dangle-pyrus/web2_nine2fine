import { InjectionToken } from '@angular/core';

export interface ApiConfig {
  mode: 'mock' | 'http';
  baseUrl: string;
}
export const API_CONFIG = new InjectionToken<ApiConfig>('API_CONFIG');
export const apiConfig: ApiConfig = { mode: 'mock', baseUrl: '/api' };
