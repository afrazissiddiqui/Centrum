const API_BASE_URL = 'http://116.203.172.106:8084/centrum_test';
export const AHCP_API_BASE_URL = '/ahcp-api';


/** Pioneer attendance API (proxied in local dev via proxy.conf.json). */
export const BIOMETRICS_API_BASE_URL = resolveBiometricsApiBaseUrl();
export const BIOMETRICS_API_KEY = 'ak_07dd2f9ab665fbad693682fa';

function resolveBiometricsApiBaseUrl(): string {
  if (typeof window === 'undefined') 
  {
    return 'Demo';
  }

  // Same-origin path avoids browser CORS. Local dev: proxy.conf.json.
  // Deployed IIS: public/web.config rewrites /biometrics-api → pioneerattendance.com.
  return '/biometrics-api';
}

/** Builds a full API URL: `{API_BASE_URL}/api/{endpoint}` */
export function apiUrl(endpoint: string, baseUrl = API_BASE_URL): string {
  const path = endpoint.replace(/^\/+/, '');
  return `${baseUrl}/api/${path}`;
}

/** Builds a full public API URL: `{API_BASE_URL}/public/api/{endpoint}` */
export function publicApiUrl(endpoint: string, baseUrl = API_BASE_URL): string {
  const path = endpoint.replace(/^\/+/, '');
  return `${baseUrl}/public/api/${path}`;
}