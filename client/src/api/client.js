import axios from 'axios';

const baseURL = import.meta.env.VITE_API_URL || '/api/v1';

export const api = axios.create({ baseURL, withCredentials: true });

// The store registers these after it is created (avoids a circular import).
let bridge = { getToken: () => null, setSession: () => {}, clearSession: () => {} };
export const connectAuthBridge = (b) => {
  bridge = b;
};

// Refresh tokens are single-use. Two simultaneous refreshes would look like token theft to the
// server and revoke the whole session, so every caller shares ONE in-flight request.
let refreshing = null;
export function refreshSession() {
  if (!refreshing) {
    refreshing = axios
      .post(`${baseURL}/auth/refresh`, null, { withCredentials: true }) // bare axios: no interceptors, no recursion
      .then((res) => {
        bridge.setSession(res.data.data);
        return res.data.data.accessToken;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

api.interceptors.request.use((config) => {
  const token = bridge.getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

const NO_REFRESH = ['/auth/login', '/auth/register-shop', '/auth/refresh', '/auth/logout'];

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config, response } = error;
    if (response?.status === 401 && config && !config._retried && !NO_REFRESH.includes(config.url)) {
      config._retried = true;
      try {
        const token = await refreshSession();
        config.headers.Authorization = `Bearer ${token}`;
        return api(config);
      } catch {
        bridge.clearSession(); // refresh failed: the session is really over
      }
    }
    throw error;
  }
);

export function errorMessage(error) {
  const err = error?.response?.data?.error;
  if (err?.message) {
    const more = Array.isArray(err.details) && err.details.length ? ` (${err.details.slice(0, 3).map((d) => d.message).join('; ')})` : '';
    return `${err.message}${more}`;
  }
  if (error?.request) return 'Cannot reach the server. Check your connection and try again.';
  return error?.message ?? 'Something went wrong';
}

// With responseType 'blob' an error body arrives as a Blob, so read the JSON out of it.
export async function readBlobError(error) {
  if (error?.response?.data instanceof Blob) {
    try {
      return JSON.parse(await error.response.data.text()).error?.message ?? 'Request failed';
    } catch {
      return 'Request failed';
    }
  }
  return errorMessage(error);
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function downloadFile(path, params) {
  const res = await api.get(path, { params, responseType: 'blob' });
  const name = /filename="?([^";]+)"?/.exec(res.headers['content-disposition'] ?? '')?.[1] ?? 'download';
  saveBlob(res.data, name);
}

const fetchPdf = async (path) => (await api.get(path, { responseType: 'blob' })).data;

// Opens in a new tab. The tab is opened synchronously (inside the click) so popup blockers allow it.
export async function openPdf(path) {
  const tab = window.open('', '_blank');
  try {
    const url = URL.createObjectURL(await fetchPdf(path));
    if (tab) tab.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (e) {
    tab?.close();
    throw e;
  }
}

// Prints through a hidden iframe. A thermal receipt PDF is already 80mm wide, so the browser's
// print dialog picks the right paper size.
export async function printPdf(path) {
  const url = URL.createObjectURL(await fetchPdf(path));
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  frame.src = url;
  frame.onload = () => {
    frame.contentWindow.focus();
    frame.contentWindow.print();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      frame.remove();
    }, 60_000);
  };
  document.body.appendChild(frame);
}