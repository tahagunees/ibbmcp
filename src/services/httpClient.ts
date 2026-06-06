import axios from 'axios';
import { config } from '../config';

const headers: Record<string, string> = {};
if (config.ibbApiToken) {
  headers['X-CKAN-API-Key'] = config.ibbApiToken;
}

export const ckanClient = axios.create({
  baseURL: config.ckanBaseUrl,
  headers,
  timeout: 10_000,
});

ckanClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // Normalize error message for MCP logging.
    const message =
      error?.response?.data?.error?.message ??
      error?.response?.statusText ??
      error?.message ??
      'Bilinmeyen ağ hatası';
    return Promise.reject(new Error(message));
  }
);
