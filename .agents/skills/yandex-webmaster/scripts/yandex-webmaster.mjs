#!/usr/bin/env node

import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import {
  chmod,
  mkdir,
  readFile,
  readdir,
  rename,
  stat,
  writeFile,
} from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { pathToFileURL } from 'node:url';

const DEFAULT_AUTH_URL = 'https://oauth.yandex.com/authorize';
const DEFAULT_TOKEN_URL = 'https://oauth.yandex.com/token';
const DEFAULT_VERIFICATION_URI = 'https://oauth.yandex.ru/verification_code';
const DEFAULT_API_BASE = 'https://api.webmaster.yandex.net/v4';
const AUTH_URL = process.env.YANDEX_AUTH_URL || DEFAULT_AUTH_URL;
const TOKEN_URL = process.env.YANDEX_TOKEN_URL || DEFAULT_TOKEN_URL;
const VERIFICATION_URI =
  process.env.YANDEX_VERIFICATION_URI || DEFAULT_VERIFICATION_URI;
const API_BASE = process.env.YANDEX_WEBMASTER_API_BASE || DEFAULT_API_BASE;
const CONFIG_DIR =
  process.env.YANDEX_WEBMASTER_CONFIG_DIR ||
  path.join(homedir(), '.config', 'codex-yandex-webmaster');
const DATA_DIR =
  process.env.YANDEX_WEBMASTER_DATA_DIR ||
  path.join(homedir(), '.local', 'share', 'codex-yandex-webmaster');
const CLIENT_FILE =
  process.env.YANDEX_WEBMASTER_CLIENT_FILE ||
  path.join(CONFIG_DIR, 'oauth-client.json');
const TOKEN_FILE =
  process.env.YANDEX_WEBMASTER_TOKEN_FILE || path.join(CONFIG_DIR, 'token.json');
const ALIASES_FILE =
  process.env.YANDEX_WEBMASTER_ALIASES_FILE ||
  path.join(CONFIG_DIR, 'hosts.json');
const INDICATORS = ['TOTAL_SHOWS', 'TOTAL_CLICKS', 'AVG_SHOW_POSITION'];
const DEVICE_TYPES = new Set([
  'ALL',
  'DESKTOP',
  'MOBILE_AND_TABLET',
  'MOBILE',
  'TABLET',
]);
const ORDER_FIELDS = new Set(['TOTAL_SHOWS', 'TOTAL_CLICKS']);
const UNAVAILABLE_CODES = new Set(['HOST_NOT_LOADED', 'HOST_NOT_INDEXED']);
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const SOURCE_QUERY_LIMIT = 3_000;

export class YandexWebmasterError extends Error {
  constructor(message, status = 0, code = '') {
    super(message);
    this.name = 'YandexWebmasterError';
    this.status = status;
    this.code = code;
  }
}

export function parseArgs(argv) {
  const [command = 'help', ...rest] = argv;
  const options = {};
  const positional = [];
  for (let index = 0; index < rest.length; index += 1) {
    const value = rest[index];
    if (!value.startsWith('--')) {
      positional.push(value);
      continue;
    }
    const equalsAt = value.indexOf('=');
    if (equalsAt !== -1) {
      options[value.slice(2, equalsAt)] = value.slice(equalsAt + 1);
      continue;
    }
    const key = value.slice(2);
    const next = rest[index + 1];
    if (next && !next.startsWith('--')) {
      options[key] = next;
      index += 1;
    } else {
      options[key] = true;
    }
  }
  return { command, options, positional };
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function readJson(file, { optional = false } = {}) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (optional && error?.code === 'ENOENT') return null;
    if (error instanceof SyntaxError) throw new Error(`Invalid JSON in ${file}`);
    throw error;
  }
}

async function findRepositoryRoot(file) {
  let current = path.dirname(path.resolve(file));
  while (true) {
    try {
      await stat(path.join(current, '.git'));
      return current;
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

async function assertOutsideRepository(file, label) {
  const repositoryRoot = await findRepositoryRoot(file);
  if (repositoryRoot) {
    throw new Error(
      `${label} must stay outside Git repositories. Move ${file} outside ${repositoryRoot}.`
    );
  }
}

async function assertPrivateFile(file, label) {
  const details = await stat(file);
  if (process.platform !== 'win32' && (details.mode & 0o077) !== 0) {
    throw new Error(
      `${label} is readable by other users. Restrict it to mode 600: ${file}`
    );
  }
  await assertOutsideRepository(file, label);
}

async function readSensitiveJson(
  file,
  { optional = false, label = 'Sensitive file' } = {}
) {
  try {
    await assertPrivateFile(file, label);
  } catch (error) {
    if (optional && error?.code === 'ENOENT') return null;
    throw error;
  }
  return readJson(file);
}

async function secureWriteJson(file, value) {
  await assertOutsideRepository(file, 'Sensitive Yandex Webmaster data');
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.${randomBytes(5).toString('hex')}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
  });
  await chmod(temporary, 0o600);
  await rename(temporary, file);
  await chmod(file, 0o600);
}

function normalizedClient(document) {
  const clientId = String(document?.client_id || document?.clientId || '').trim();
  const clientSecret = String(
    document?.client_secret || document?.clientSecret || ''
  ).trim();
  if (!clientId || !clientSecret) {
    throw new Error(
      'OAuth client must contain non-empty client_id and client_secret values'
    );
  }
  return { client_id: clientId, client_secret: clientSecret };
}

async function loadClient() {
  return normalizedClient(
    await readSensitiveJson(CLIENT_FILE, { label: 'OAuth client file' })
  );
}

function redact(message, values) {
  return [...new Set(values
    .filter((value) => typeof value === 'string' && value.length >= 4)
    .flatMap((value) => [value, encodeURIComponent(value)]))]
    .sort((left, right) => right.length - left.length)
    .reduce(
      (redacted, value) => redacted.split(value).join('[REDACTED]'),
      String(message || '')
    );
}

async function postForm(url, values) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(values),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text.slice(0, 1_000) };
  }
  if (!response.ok) {
    const detail =
      body.error_description || body.error || body.raw || 'unknown error';
    throw new Error(
      `Yandex OAuth returned ${response.status}: ${redact(detail, [
        values.client_secret,
        values.code,
        values.refresh_token,
      ])}`
    );
  }
  return body;
}

async function saveToken(token, previous = {}) {
  const accessToken = String(token.access_token || '').trim();
  const refreshToken = String(
    token.refresh_token || previous.refresh_token || ''
  ).trim();
  if (!accessToken || !refreshToken) {
    throw new Error(
      'Yandex did not return renewable credentials; run auth again interactively'
    );
  }
  const expiresIn = Number(token.expires_in || 0);
  const merged = {
    ...previous,
    ...token,
    access_token: accessToken,
    refresh_token: refreshToken,
    obtained_at: new Date().toISOString(),
    expires_at:
      Number.isFinite(expiresIn) && expiresIn > 0
        ? Date.now() + expiresIn * 1_000
        : previous.expires_at || null,
  };
  delete merged.expires_in;
  await secureWriteJson(TOKEN_FILE, merged);
  return merged;
}

async function getAccessToken({ forceRefresh = false } = {}) {
  const token = await readSensitiveJson(TOKEN_FILE, {
    optional: true,
    label: 'OAuth token file',
  });
  if (!token?.refresh_token) {
    throw new Error(
      `No renewable Yandex token found at ${TOKEN_FILE}. Run auth interactively.`
    );
  }
  if (
    !forceRefresh &&
    token.access_token &&
    Number(token.expires_at) > Date.now() + 5 * 60_000
  ) {
    return token.access_token;
  }
  const client = await loadClient();
  const refreshed = await postForm(TOKEN_URL, {
    client_id: client.client_id,
    client_secret: client.client_secret,
    refresh_token: token.refresh_token,
    grant_type: 'refresh_token',
  });
  return (await saveToken(refreshed, token)).access_token;
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function apiRequest(apiPath, configure) {
  let accessToken = await getAccessToken();
  let refreshedAfterUnauthorized = false;
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const url = new URL(`${API_BASE}${apiPath}`);
    configure?.(url);
    try {
      const response = await fetch(url, {
        headers: {
          accept: 'application/json',
          authorization: `OAuth ${accessToken}`,
        },
        signal: AbortSignal.timeout(30_000),
      });
      const text = await response.text();
      let body;
      try {
        body = text ? JSON.parse(text) : {};
      } catch {
        body = { raw: text.slice(0, 1_500) };
      }
      if (response.status === 401 && !refreshedAfterUnauthorized) {
        accessToken = await getAccessToken({ forceRefresh: true });
        refreshedAfterUnauthorized = true;
        attempt -= 1;
        continue;
      }
      if (!response.ok) {
        const detail =
          body.error_message ||
          body.message ||
          body.error_description ||
          body.raw ||
          'unknown error';
        const error = new YandexWebmasterError(
          redact(detail, [accessToken]),
          response.status,
          String(body.error_code || body.error || '')
        );
        if (RETRYABLE_STATUSES.has(response.status) && attempt < 2) {
          lastError = error;
          const retryAfter = Number(response.headers.get('retry-after'));
          await wait(
            Number.isFinite(retryAfter) && retryAfter > 0
              ? Math.min(retryAfter * 1_000, 10_000)
              : 500 * 2 ** attempt
          );
          continue;
        }
        throw error;
      }
      return body;
    } catch (error) {
      lastError = error;
      const retryable =
        error instanceof TypeError ||
        error?.name === 'AbortError' ||
        error?.name === 'TimeoutError';
      if (!retryable || attempt === 2) break;
      await wait(500 * 2 ** attempt);
    }
  }
  if (lastError instanceof YandexWebmasterError) throw lastError;
  if (lastError instanceof Error) {
    throw new Error(redact(lastError.message, [accessToken]));
  }
  throw new Error('Yandex Webmaster API is temporarily unavailable');
}

function base64Url(buffer) {
  return buffer
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');
}

export function buildAuthorizationUrl(
  clientId,
  {
    state = base64Url(randomBytes(24)),
    verifier = base64Url(randomBytes(48)),
    authUrl = AUTH_URL,
    verificationUri = VERIFICATION_URI,
  } = {}
) {
  const challenge = base64Url(createHash('sha256').update(verifier).digest());
  const url = new URL(authUrl);
  url.search = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: verificationUri,
    state,
    force_confirm: 'yes',
    code_challenge: challenge,
    code_challenge_method: 'S256',
  }).toString();
  return { url, state, verifier };
}

function openBrowser(url) {
  if (process.platform === 'darwin') {
    const child = spawn('/usr/bin/open', [url], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    return;
  }
  const command = process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args =
    process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  const child = spawn(command, args, { detached: true, stdio: 'ignore' });
  child.unref();
}

async function authorize({ noOpen = false } = {}) {
  if (!process.stdin.isTTY || !process.stderr.isTTY) {
    throw new Error(
      'auth requires an interactive terminal because the confirmation code must not be passed through automation logs'
    );
  }
  const client = await loadClient();
  const { url, verifier } = buildAuthorizationUrl(client.client_id);
  process.stderr.write(
    `Authorize Yandex Webmaster in your browser, then paste the displayed confirmation code here:\n${url}\n`
  );
  if (!noOpen) openBrowser(url.toString());
  const prompt = createInterface({
    input: process.stdin,
    output: process.stderr,
    terminal: true,
  });
  let code;
  try {
    code = (await prompt.question('Confirmation code: ')).trim();
  } finally {
    prompt.close();
  }
  if (!code) throw new Error('Confirmation code is required');
  const token = await postForm(TOKEN_URL, {
    code,
    client_id: client.client_id,
    client_secret: client.client_secret,
    grant_type: 'authorization_code',
    code_verifier: verifier,
  });
  const saved = await saveToken(token);
  const { userId, hosts } = await listHosts();
  saved.user_id = userId;
  await secureWriteJson(TOKEN_FILE, saved);
  return {
    authorized: true,
    userId,
    hostCount: hosts.length,
    verifiedHostCount: hosts.filter((host) => host.verified).length,
    tokenFile: TOKEN_FILE,
    accessTokenExpiresAt: saved.expires_at
      ? new Date(Number(saved.expires_at)).toISOString()
      : null,
  };
}

function finiteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function optionalNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function dateOnly(value) {
  if (typeof value !== 'string' || !value) return null;
  const matched = value.match(/^\d{4}-\d{2}-\d{2}/u);
  if (matched) return matched[0];
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf())
    ? null
    : parsed.toISOString().slice(0, 10);
}

function appendIndicators(url, deviceType) {
  for (const indicator of INDICATORS) {
    url.searchParams.append('query_indicator', indicator);
  }
  url.searchParams.set('device_type_indicator', deviceType);
}

async function getUserId() {
  const response = await apiRequest('/user');
  const userId = String(response.user_id ?? '').trim();
  if (!userId) throw new Error('Yandex Webmaster did not return a user ID');
  return userId;
}

function normalizeHost(host) {
  return {
    hostId: String(host.host_id || '').trim(),
    asciiHostUrl: String(host.ascii_host_url || '').trim(),
    unicodeHostUrl: String(host.unicode_host_url || '').trim(),
    displayName: String(host.host_display_name || '').trim(),
    verified: host.verified === true,
    hostDataStatus: String(host.host_data_status || '').trim() || null,
  };
}

async function listHosts() {
  const userId = await getUserId();
  const response = await apiRequest(`/user/${encodeURIComponent(userId)}/hosts`);
  const hosts = (response.hosts || [])
    .map(normalizeHost)
    .filter((host) => host.hostId)
    .sort((left, right) =>
      (left.asciiHostUrl || left.hostId).localeCompare(
        right.asciiHostUrl || right.hostId
      )
    );
  return { userId, hosts };
}

function positiveInteger(value, fallback, label, maximum = Number.MAX_SAFE_INTEGER) {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > maximum) {
    throw new Error(`${label} must be an integer from 1 to ${maximum}`);
  }
  return parsed;
}

function nonNegativeInteger(value, fallback, label) {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return parsed;
}

function validDate(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    throw new Error(`${label} must use YYYY-MM-DD`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`${label} is not a valid calendar date`);
  }
  return value;
}

export function shiftDate(dateText, deltaDays) {
  validDate(dateText, 'date');
  const [year, month, day] = dateText.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + deltaDays))
    .toISOString()
    .slice(0, 10);
}

export function queryPeriod(options = {}, now = new Date()) {
  const days = positiveInteger(options.days, 28, '--days', 2_000);
  const endLag = nonNegativeInteger(options['end-lag'], 2, '--end-lag');
  const defaultEnd = shiftDate(now.toISOString().slice(0, 10), -endLag);
  const endDate = validDate(options['end-date'] || defaultEnd, '--end-date');
  const startDate = validDate(
    options['start-date'] || shiftDate(endDate, -(days - 1)),
    '--start-date'
  );
  if (startDate > endDate) {
    throw new Error('--start-date must not be after --end-date');
  }
  return { startDate, endDate };
}

function deviceType(options) {
  const value = String(options['device-type'] || 'ALL').toUpperCase();
  if (!DEVICE_TYPES.has(value)) {
    throw new Error(
      `--device-type must be one of ${Array.from(DEVICE_TYPES).join(', ')}`
    );
  }
  return value;
}

function orderBy(options) {
  const value = String(options['order-by'] || 'TOTAL_SHOWS').toUpperCase();
  if (!ORDER_FIELDS.has(value)) {
    throw new Error('--order-by must be TOTAL_SHOWS or TOTAL_CLICKS');
  }
  return value;
}

export function normalizeHistory(response) {
  const indicators = response?.indicators || {};
  const byDate = new Map();
  const apply = (indicator, field) => {
    for (const point of indicators[indicator] || []) {
      const date = dateOnly(point.date);
      if (!date) continue;
      const row = byDate.get(date) || {
        clicks: 0,
        impressions: 0,
        position: null,
      };
      row[field] =
        field === 'position'
          ? optionalNumber(point.value)
          : finiteNumber(point.value);
      byDate.set(date, row);
    }
  };
  apply('TOTAL_CLICKS', 'clicks');
  apply('TOTAL_SHOWS', 'impressions');
  apply('AVG_SHOW_POSITION', 'position');
  return Array.from(byDate, ([date, row]) => ({
    date,
    ...row,
    ctr: row.impressions > 0 ? row.clicks / row.impressions : 0,
  })).sort((left, right) => left.date.localeCompare(right.date));
}

export function aggregateHistory(rows) {
  const clicks = rows.reduce((sum, row) => sum + row.clicks, 0);
  const impressions = rows.reduce((sum, row) => sum + row.impressions, 0);
  let positionTotal = 0;
  let positionWeight = 0;
  for (const row of rows) {
    if (row.position !== null && row.impressions > 0) {
      positionTotal += row.position * row.impressions;
      positionWeight += row.impressions;
    }
  }
  return {
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : 0,
    position: positionWeight > 0 ? positionTotal / positionWeight : null,
  };
}

async function fetchHistory(userId, hostId, period, selectedDeviceType) {
  const response = await apiRequest(
    `/user/${encodeURIComponent(userId)}/hosts/${encodeURIComponent(
      hostId
    )}/search-queries/all/history`,
    (url) => {
      appendIndicators(url, selectedDeviceType);
      url.searchParams.set('date_from', period.startDate);
      url.searchParams.set('date_to', period.endDate);
    }
  );
  const rows = normalizeHistory(response);
  return {
    summary: {
      dimensions: [],
      rowCount: 1,
      dataCompleteness: 'aggregate',
      rows: [aggregateHistory(rows)],
    },
    date: {
      dimensions: ['date'],
      deviceType: selectedDeviceType,
      rowCount: rows.length,
      dataCompleteness: 'aggregate',
      rows,
    },
  };
}

export function normalizePopularQueries(queries) {
  return (queries || [])
    .map((query) => {
      const indicators = query.indicators || {};
      const clicks = finiteNumber(indicators.TOTAL_CLICKS);
      const impressions = finiteNumber(indicators.TOTAL_SHOWS);
      return {
        query: String(query.query_text || '').trim(),
        clicks,
        impressions,
        ctr: impressions > 0 ? clicks / impressions : 0,
        position: optionalNumber(indicators.AVG_SHOW_POSITION),
      };
    })
    .filter((row) => row.query);
}

async function fetchPopularQueries(
  userId,
  hostId,
  period,
  selectedDeviceType,
  selectedOrderBy,
  maxRows
) {
  const rows = [];
  let offset = 0;
  let pagesFetched = 0;
  let reportedCount = null;
  let returnedStartDate = null;
  let returnedEndDate = null;
  while (rows.length < maxRows && offset < SOURCE_QUERY_LIMIT) {
    const limit = Math.min(500, maxRows - rows.length, SOURCE_QUERY_LIMIT - offset);
    const response = await apiRequest(
      `/user/${encodeURIComponent(userId)}/hosts/${encodeURIComponent(
        hostId
      )}/search-queries/popular`,
      (url) => {
        appendIndicators(url, selectedDeviceType);
        url.searchParams.set('order_by', selectedOrderBy);
        url.searchParams.set('date_from', period.startDate);
        url.searchParams.set('date_to', period.endDate);
        url.searchParams.set('offset', String(offset));
        url.searchParams.set('limit', String(limit));
      }
    );
    pagesFetched += 1;
    const batch = normalizePopularQueries(response.queries);
    rows.push(...batch);
    reportedCount = Math.min(
      SOURCE_QUERY_LIMIT,
      Math.max(0, Math.trunc(finiteNumber(response.count)))
    );
    returnedStartDate = dateOnly(response.date_from) || returnedStartDate;
    returnedEndDate = dateOnly(response.date_to) || returnedEndDate;
    if (batch.length < limit) break;
    offset += batch.length;
    if (reportedCount !== null && offset >= reportedCount) break;
  }
  const availableRows =
    reportedCount === null ? SOURCE_QUERY_LIMIT : reportedCount;
  return {
    dimensions: ['query'],
    deviceType: selectedDeviceType,
    orderBy: selectedOrderBy,
    rowCount: rows.length,
    reportedCount,
    pagesFetched,
    truncated: rows.length >= maxRows && availableRows > rows.length,
    sourceLimit: SOURCE_QUERY_LIMIT,
    returnedPeriod: {
      startDate: returnedStartDate,
      endDate: returnedEndDate,
    },
    dataCompleteness: 'top-queries',
    rows,
  };
}

async function readAliases() {
  return (
    (await readSensitiveJson(ALIASES_FILE, {
      optional: true,
      label: 'Host aliases file',
    })) || { aliases: {} }
  );
}

async function resolveHost(value) {
  if (!value) {
    throw new Error('Missing --host. Use an exact hostId or a configured alias.');
  }
  const aliases = await readAliases();
  if (aliases.aliases?.[value]) return aliases.aliases[value];
  if (/\s/u.test(value) || !value.includes(':')) {
    throw new Error(
      `Unknown host alias: ${value}. Run hosts, then add it with alias.`
    );
  }
  return value;
}

async function hostContext(hostId) {
  const { userId, hosts } = await listHosts();
  const host = hosts.find((candidate) => candidate.hostId === hostId);
  if (!host) {
    throw new Error(
      `The authorized Yandex account does not expose exact hostId ${hostId}`
    );
  }
  return { userId, host };
}

async function saveAlias(name, hostId) {
  if (!/^[a-z0-9][a-z0-9._-]*$/u.test(name || '')) {
    throw new Error(
      'Alias names must use lowercase letters, digits, dots, underscores, or hyphens'
    );
  }
  if (!hostId || /\s/u.test(hostId) || !hostId.includes(':')) {
    throw new Error('Alias target must be an exact hostId returned by hosts');
  }
  const current = await readAliases();
  current.aliases = { ...(current.aliases || {}), [name]: hostId };
  await secureWriteJson(ALIASES_FILE, current);
  return { alias: name, hostId, aliasesFile: ALIASES_FILE };
}

function emptyDataset(name, selectedDeviceType, selectedOrderBy) {
  if (name === 'summary') {
    return {
      dimensions: [],
      rowCount: 0,
      dataCompleteness: 'unavailable',
      rows: [],
    };
  }
  if (name === 'date') {
    return {
      dimensions: ['date'],
      deviceType: selectedDeviceType,
      rowCount: 0,
      dataCompleteness: 'unavailable',
      rows: [],
    };
  }
  return {
    dimensions: ['query'],
    deviceType: selectedDeviceType,
    orderBy: selectedOrderBy,
    rowCount: 0,
    reportedCount: null,
    pagesFetched: 0,
    truncated: false,
    sourceLimit: SOURCE_QUERY_LIMIT,
    returnedPeriod: { startDate: null, endDate: null },
    dataCompleteness: 'unavailable',
    rows: [],
  };
}

function availabilityFromError(error) {
  if (!(error instanceof YandexWebmasterError) || !UNAVAILABLE_CODES.has(error.code)) {
    return null;
  }
  if (error.code === 'HOST_NOT_INDEXED') {
    return {
      state: 'host-not-indexed',
      message:
        'Yandex has not indexed this host, so search-performance data is unavailable.',
    };
  }
  return {
    state: 'host-not-loaded',
    message:
      'Yandex Webmaster has not loaded statistics for this host yet.',
  };
}

function hostSlug(hostId) {
  return (
    hostId
      .replace(/[^a-zA-Z0-9._-]+/gu, '_')
      .replace(/^_+|_+$/gu, '') || 'host'
  );
}

async function createSnapshot(hostId, options) {
  const requested = String(options.datasets || 'summary,date,query')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const allowed = new Set(['summary', 'date', 'query']);
  for (const name of requested) {
    if (!allowed.has(name)) throw new Error(`Unknown snapshot dataset: ${name}`);
  }
  const period = queryPeriod(options);
  const selectedDeviceType = deviceType(options);
  const selectedOrderBy = orderBy(options);
  const maxRows = positiveInteger(
    options['max-rows'],
    SOURCE_QUERY_LIMIT,
    '--max-rows',
    SOURCE_QUERY_LIMIT
  );
  const { userId, host } = await hostContext(hostId);
  let datasets = {};
  let dataAvailability = {
    state: 'available',
    message: 'Yandex Webmaster search-performance data was loaded.',
  };
  try {
    const needsHistory =
      requested.includes('summary') || requested.includes('date');
    const [history, queries] = await Promise.all([
      needsHistory
        ? fetchHistory(userId, hostId, period, selectedDeviceType)
        : null,
      requested.includes('query')
        ? fetchPopularQueries(
            userId,
            hostId,
            period,
            selectedDeviceType,
            selectedOrderBy,
            maxRows
          )
        : null,
    ]);
    for (const name of requested) {
      if (name === 'query') datasets.query = queries;
      else datasets[name] = history[name];
    }
  } catch (error) {
    const unavailable = availabilityFromError(error);
    if (!unavailable) throw error;
    dataAvailability = unavailable;
    datasets = Object.fromEntries(
      requested.map((name) => [
        name,
        emptyDataset(name, selectedDeviceType, selectedOrderBy),
      ])
    );
  }
  const fetchedAt = new Date().toISOString();
  const dataThrough = datasets.date?.rows?.at(-1)?.date || null;
  const snapshot = {
    schemaVersion: 1,
    source: 'yandex-webmaster-api',
    fetchedAt,
    host: { userId, ...host },
    period,
    deviceType: selectedDeviceType,
    queryOrderBy: selectedOrderBy,
    dataState: 'service-defined',
    dataAvailability,
    dataThrough,
    datasets,
  };
  const directory = path.join(DATA_DIR, 'snapshots', hostSlug(hostId));
  const filename = `${period.endDate}_${fetchedAt
    .replaceAll(':', '-')
    .replace(/\.\d{3}Z$/u, 'Z')}.json`;
  const output = options.output
    ? path.resolve(options.output)
    : path.join(directory, filename);
  await secureWriteJson(output, snapshot);
  const summary = {
    source: snapshot.source,
    fetchedAt,
    host: snapshot.host,
    period,
    deviceType: selectedDeviceType,
    queryOrderBy: selectedOrderBy,
    dataState: snapshot.dataState,
    dataAvailability,
    dataThrough,
    path: output,
    datasets: Object.fromEntries(
      Object.entries(datasets).map(([name, value]) => [
        name,
        {
          rowCount: value.rowCount,
          dataCompleteness: value.dataCompleteness,
          ...(name === 'query'
            ? {
                reportedCount: value.reportedCount,
                pagesFetched: value.pagesFetched,
                truncated: value.truncated,
                returnedPeriod: value.returnedPeriod,
              }
            : {}),
        },
      ])
    ),
  };
  await secureWriteJson(path.join(directory, 'latest.json'), summary);
  return summary;
}

async function fileStatus(file) {
  const repositoryRoot = await findRepositoryRoot(file);
  try {
    const details = await stat(file);
    return {
      present: true,
      mode: (details.mode & 0o777).toString(8).padStart(3, '0'),
      ownerOnly:
        process.platform === 'win32' ? null : (details.mode & 0o077) === 0,
      repositoryRoot,
      modifiedAt: details.mtime.toISOString(),
    };
  } catch (error) {
    if (error?.code === 'ENOENT') return { present: false, repositoryRoot };
    throw error;
  }
}

async function listSnapshotPointers() {
  const root = path.join(DATA_DIR, 'snapshots');
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
  const snapshots = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const pointer = path.join(root, entry.name, 'latest.json');
    const latest = await readJson(pointer, { optional: true });
    if (latest) snapshots.push({ ...latest, pointer });
  }
  return snapshots.sort((left, right) =>
    String(right.fetchedAt || '').localeCompare(String(left.fetchedAt || ''))
  );
}

async function doctor() {
  const clientStatus = await fileStatus(CLIENT_FILE);
  const tokenStatus = await fileStatus(TOKEN_FILE);
  const aliasesStatus = await fileStatus(ALIASES_FILE);
  const warnings = [];
  let clientValid = false;
  let clientIdSuffix = null;
  let hasRefreshToken = false;
  let accessTokenExpiresAt = null;
  let userId = null;
  for (const [label, status] of [
    ['OAuth client file', clientStatus],
    ['OAuth token file', tokenStatus],
    ['Host aliases file', aliasesStatus],
  ]) {
    if (status.ownerOnly === false) {
      warnings.push(`${label} must use owner-only permissions (mode 600).`);
    }
    if (status.repositoryRoot) {
      warnings.push(`${label} must stay outside Git repositories.`);
    }
  }
  const clientSafe =
    clientStatus.present &&
    clientStatus.ownerOnly !== false &&
    !clientStatus.repositoryRoot;
  const tokenSafe =
    tokenStatus.present &&
    tokenStatus.ownerOnly !== false &&
    !tokenStatus.repositoryRoot;
  if (clientSafe) {
    const client = normalizedClient(await readJson(CLIENT_FILE));
    clientValid = true;
    clientIdSuffix = client.client_id.slice(-6);
  }
  if (tokenSafe) {
    const token = await readJson(TOKEN_FILE);
    hasRefreshToken = Boolean(token.refresh_token);
    accessTokenExpiresAt = token.expires_at
      ? new Date(Number(token.expires_at)).toISOString()
      : null;
    userId = token.user_id ? String(token.user_id) : null;
  }
  const ready = clientSafe && tokenSafe && clientValid && hasRefreshToken;
  const blockers = [];
  if (!clientSafe || !clientValid) {
    blockers.push({
      code: 'oauth-client-not-ready',
      message: 'Create and install a user-owned Yandex OAuth application configuration.',
    });
  }
  if (!tokenSafe || !hasRefreshToken) {
    blockers.push({
      code: 'oauth-token-not-ready',
      message: 'Complete interactive OAuth authorization to create a renewable token.',
    });
  }
  const nextActions = [];
  if (!ready) nextActions.push('Read references/oauth-setup.md and complete the user-owned credential steps.');
  if (warnings.length) nextActions.push('Resolve every warning before authorization or data access.');
  if (blockers.some((blocker) => blocker.code === 'oauth-token-not-ready')) {
    nextActions.push('Run auth interactively after the OAuth client is configured.');
  }
  if (!ready) nextActions.push('Run doctor again and require ready: true.');
  return {
    ready,
    warnings,
    blockers,
    nextActions,
    setupGuide: 'references/oauth-setup.md',
    configDirectory: CONFIG_DIR,
    clientFile: {
      path: CLIENT_FILE,
      ...clientStatus,
      valid: clientValid,
      clientIdSuffix,
    },
    tokenFile: {
      path: TOKEN_FILE,
      ...tokenStatus,
      hasRefreshToken,
      accessTokenExpiresAt,
      userId,
    },
    aliasesFile: {
      path: ALIASES_FILE,
      ...aliasesStatus,
    },
    dataDirectory: DATA_DIR,
    requiredPermissions: ['webmaster:hostinfo', 'webmaster:verify'],
    verificationUri: VERIFICATION_URI,
  };
}

async function configureClient(options) {
  let document;
  if (options['from-env']) {
    document = {
      client_id: process.env.YANDEX_CLIENT_ID,
      client_secret: process.env.YANDEX_CLIENT_SECRET,
    };
  } else if (options.input) {
    document = await readSensitiveJson(path.resolve(options.input), {
      label: 'OAuth client input file',
    });
  } else {
    throw new Error('configure requires --from-env or --input FILE');
  }
  const client = normalizedClient(document);
  await secureWriteJson(CLIENT_FILE, client);
  return {
    configured: true,
    clientFile: CLIENT_FILE,
    mode: '600',
    clientIdSuffix: client.client_id.slice(-6),
  };
}

function help() {
  return `Yandex Webmaster CLI

Commands:
  doctor
  configure --from-env
  configure --input FILE
  auth [--no-open]
  refresh
  hosts
  alias --name NAME --host EXACT_HOST_ID
  query --host HOST [--dataset summary|date|query] [--days 28] [--end-lag 2]
        [--start-date YYYY-MM-DD] [--end-date YYYY-MM-DD]
        [--device-type ALL|DESKTOP|MOBILE_AND_TABLET|MOBILE|TABLET]
        [--order-by TOTAL_SHOWS|TOTAL_CLICKS] [--max-rows 3000] [--output FILE]
  snapshot --host HOST [query flags] [--datasets summary,date,query] [--output FILE]
  snapshots
  latest --host HOST

Environment overrides:
  YANDEX_WEBMASTER_CONFIG_DIR, YANDEX_WEBMASTER_DATA_DIR,
  YANDEX_WEBMASTER_CLIENT_FILE, YANDEX_WEBMASTER_TOKEN_FILE,
  YANDEX_WEBMASTER_ALIASES_FILE
`;
}

export async function main(argv = process.argv.slice(2)) {
  const { command, options } = parseArgs(argv);
  switch (command) {
    case 'help':
    case '--help':
    case '-h':
      process.stdout.write(help());
      return;
    case 'doctor':
      printJson(await doctor());
      return;
    case 'configure':
      printJson(await configureClient(options));
      return;
    case 'auth':
      printJson(await authorize({ noOpen: Boolean(options['no-open']) }));
      return;
    case 'refresh': {
      await getAccessToken({ forceRefresh: true });
      const status = await doctor();
      printJson({
        refreshed: true,
        tokenFile: status.tokenFile.path,
        mode: status.tokenFile.mode,
        accessTokenExpiresAt: status.tokenFile.accessTokenExpiresAt,
      });
      return;
    }
    case 'hosts':
      printJson(await listHosts());
      return;
    case 'alias':
      printJson(await saveAlias(options.name, options.host));
      return;
    case 'query': {
      const hostId = await resolveHost(options.host);
      const period = queryPeriod(options);
      const selectedDeviceType = deviceType(options);
      const selectedOrderBy = orderBy(options);
      const maxRows = positiveInteger(
        options['max-rows'],
        SOURCE_QUERY_LIMIT,
        '--max-rows',
        SOURCE_QUERY_LIMIT
      );
      const datasetName = options.dataset || 'query';
      if (!['summary', 'date', 'query'].includes(datasetName)) {
        throw new Error('--dataset must be summary, date, or query');
      }
      const { userId, host } = await hostContext(hostId);
      let result;
      if (datasetName === 'query') {
        result = await fetchPopularQueries(
          userId,
          hostId,
          period,
          selectedDeviceType,
          selectedOrderBy,
          maxRows
        );
      } else {
        result = (
          await fetchHistory(userId, hostId, period, selectedDeviceType)
        )[datasetName];
      }
      const outputDocument = {
        schemaVersion: 1,
        source: 'yandex-webmaster-api',
        fetchedAt: new Date().toISOString(),
        host: { userId, ...host },
        period,
        deviceType: selectedDeviceType,
        queryOrderBy: selectedOrderBy,
        dataState: 'service-defined',
        dataset: datasetName,
        result,
      };
      if (options.output) {
        const output = path.resolve(options.output);
        await secureWriteJson(output, outputDocument);
        printJson({
          ...outputDocument,
          result: { ...result, rows: undefined },
          path: output,
        });
      } else {
        printJson(outputDocument);
      }
      return;
    }
    case 'snapshot': {
      const hostId = await resolveHost(options.host);
      printJson(await createSnapshot(hostId, options));
      return;
    }
    case 'snapshots':
      printJson({ snapshots: await listSnapshotPointers() });
      return;
    case 'latest': {
      const hostId = await resolveHost(options.host);
      const pointer = path.join(
        DATA_DIR,
        'snapshots',
        hostSlug(hostId),
        'latest.json'
      );
      const latest = await readJson(pointer);
      printJson({ ...latest, pointer });
      return;
    }
    default:
      throw new Error(`Unknown command: ${command}\n\n${help()}`);
  }
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : '';
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    process.stderr.write(`yandex-webmaster: ${error.message}\n`);
    process.exitCode = 1;
  });
}
