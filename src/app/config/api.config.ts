const API_BASE_URL = 'http://alhafiz.vdc.services:8084/ahcp/public';


/** Pioneer attendance API (proxied in local dev via proxy.conf.json). */
export const BIOMETRICS_API_BASE_URL = resolveBiometricsApiBaseUrl();
export const BIOMETRICS_API_KEY = 'ak_07dd2f9ab665fbad693682fa';

function resolveBiometricsApiBaseUrl(): string {
  if (typeof window === 'undefined') 
  {
    return 'http://pioneerattendance.com:3002/api';
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