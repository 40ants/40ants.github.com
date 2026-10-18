import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {
  chmod,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  aggregateHistory,
  buildAuthorizationUrl,
  normalizeHistory,
  normalizePopularQueries,
  queryPeriod,
} from './yandex-webmaster.mjs';

const scriptPath = fileURLToPath(new URL('./yandex-webmaster.mjs', import.meta.url));
const repositoryRoot = path.resolve(path.dirname(scriptPath), '../../..');

function runCli(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('close', (code) => resolve({ code, stdout, stderr }));
  });
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
}

test('authorization uses confirmation-code PKCE and omits scope', () => {
  const { url } = buildAuthorizationUrl('client-id', {
    state: 'state-value',
    verifier: 'verifier-value',
    authUrl: 'https://oauth.yandex.com/authorize',
    verificationUri: 'https://oauth.yandex.ru/verification_code',
  });

  assert.equal(url.searchParams.get('client_id'), 'client-id');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(
    url.searchParams.get('redirect_uri'),
    'https://oauth.yandex.ru/verification_code'
  );
  assert.equal(url.searchParams.get('state'), 'state-value');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.ok(url.searchParams.get('code_challenge'));
  assert.equal(url.searchParams.has('scope'), false);
});

test('history normalization aligns indicators and computes authoritative summary', () => {
  const rows = normalizeHistory({
    indicators: {
      TOTAL_CLICKS: [
        { date: '2026-07-01T00:00:00.000+03:00', value: 2 },
        { date: '2026-07-02T00:00:00.000+03:00', value: 8 },
      ],
      TOTAL_SHOWS: [
        { date: '2026-07-01T00:00:00.000+03:00', value: 20 },
        { date: '2026-07-02T00:00:00.000+03:00', value: 80 },
      ],
      AVG_SHOW_POSITION: [
        { date: '2026-07-01T00:00:00.000+03:00', value: 8 },
        { date: '2026-07-02T00:00:00.000+03:00', value: 4 },
      ],
    },
  });

  assert.deepEqual(rows, [
    {
      date: '2026-07-01',
      clicks: 2,
      impressions: 20,
      position: 8,
      ctr: 0.1,
    },
    {
      date: '2026-07-02',
      clicks: 8,
      impressions: 80,
      position: 4,
      ctr: 0.1,
    },
  ]);
  assert.deepEqual(aggregateHistory(rows), {
    clicks: 10,
    impressions: 100,
    ctr: 0.1,
    position: 4.8,
  });
});

test('popular query rows remain top-row evidence with normalized metrics', () => {
  assert.deepEqual(
    normalizePopularQueries([
      {
        query_text: ' example keyword ',
        indicators: {
          TOTAL_CLICKS: '4',
          TOTAL_SHOWS: '40',
          AVG_SHOW_POSITION: '3.5',
        },
      },
    ]),
    [
      {
        query: 'example keyword',
        clicks: 4,
        impressions: 40,
        ctr: 0.1,
        position: 3.5,
      },
    ]
  );
});

test('period defaults to 28 days ending two UTC days ago', () => {
  assert.deepEqual(queryPeriod({}, new Date('2026-07-24T18:00:00.000Z')), {
    startDate: '2026-06-25',
    endDate: '2026-07-22',
  });
  assert.deepEqual(
    queryPeriod(
      { days: '7', 'end-date': '2026-07-10' },
      new Date('2026-07-24T18:00:00.000Z')
    ),
    {
      startDate: '2026-07-04',
      endDate: '2026-07-10',
    }
  );
});

test('CLI refreshes tokens, discovers exact hosts, paginates queries, and writes snapshots', async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'yandex-webmaster-skill-'));
  const configDirectory = path.join(temporary, 'config');
  const dataDirectory = path.join(temporary, 'data');
  const sharedEnvironment = {
    YANDEX_WEBMASTER_CONFIG_DIR: configDirectory,
    YANDEX_WEBMASTER_DATA_DIR: dataDirectory,
  };
  const doctorResult = await runCli(['doctor'], sharedEnvironment);
  assert.equal(doctorResult.code, 0, doctorResult.stderr);
  const doctor = JSON.parse(doctorResult.stdout);
  assert.equal(doctor.ready, false);
  assert.deepEqual(doctor.blockers.map((blocker) => blocker.code), [
    'oauth-client-not-ready',
    'oauth-token-not-ready',
  ]);
  assert.equal(doctor.setupGuide, 'references/oauth-setup.md');

  const configured = await runCli(['configure', '--from-env'], {
    ...sharedEnvironment,
    YANDEX_CLIENT_ID: 'mock-client-id',
    YANDEX_CLIENT_SECRET: 'mock-client-secret',
  });
  assert.equal(configured.code, 0, configured.stderr);
  assert.equal(configured.stdout.includes('mock-client-secret'), false);
  assert.equal(
    (await stat(path.join(configDirectory, 'oauth-client.json'))).mode & 0o777,
    0o600
  );
  await writeFile(
    path.join(configDirectory, 'token.json'),
    `${JSON.stringify({
      access_token: 'expired-access-token',
      refresh_token: 'initial-refresh-token',
      expires_at: 1,
    })}\n`,
    { mode: 0o600 }
  );
  await chmod(path.join(configDirectory, 'token.json'), 0o600);

  let tokenRequests = 0;
  const popularOffsets = [];
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname === '/token') {
      tokenRequests += 1;
      let body = '';
      for await (const chunk of request) body += chunk;
      const form = new URLSearchParams(body);
      assert.equal(form.get('grant_type'), 'refresh_token');
      assert.equal(form.get('refresh_token'), 'initial-refresh-token');
      response.setHeader('content-type', 'application/json');
      response.end(
        JSON.stringify({
          access_token: 'fresh-access-token',
          refresh_token: 'rotated-refresh-token',
          expires_in: 3600,
          token_type: 'bearer',
        })
      );
      return;
    }
    assert.equal(request.headers.authorization, 'OAuth fresh-access-token');
    response.setHeader('content-type', 'application/json');
    if (url.pathname === '/v4/user') {
      response.end(JSON.stringify({ user_id: 42 }));
      return;
    }
    if (url.pathname === '/v4/user/42/hosts') {
      response.end(
        JSON.stringify({
          hosts: [
            {
              host_id: 'https:example.com:443',
              ascii_host_url: 'https://example.com/',
              unicode_host_url: 'https://example.com/',
              host_display_name: 'Example',
              verified: true,
              host_data_status: 'OK',
            },
          ],
        })
      );
      return;
    }
    if (url.pathname.endsWith('/search-queries/all/history')) {
      if (url.searchParams.get('date_from') === '2026-05-01') {
        response.statusCode = 404;
        response.end(
          JSON.stringify({
            error_code: 'HOST_NOT_LOADED',
            error_message: 'Site data is not loaded',
          })
        );
        return;
      }
      assert.deepEqual(url.searchParams.getAll('query_indicator'), [
        'TOTAL_SHOWS',
        'TOTAL_CLICKS',
        'AVG_SHOW_POSITION',
      ]);
      response.end(
        JSON.stringify({
          indicators: {
            TOTAL_CLICKS: [
              { date: '2026-07-01T00:00:00+03:00', value: 2 },
              { date: '2026-07-02T00:00:00+03:00', value: 8 },
            ],
            TOTAL_SHOWS: [
              { date: '2026-07-01T00:00:00+03:00', value: 20 },
              { date: '2026-07-02T00:00:00+03:00', value: 80 },
            ],
            AVG_SHOW_POSITION: [
              { date: '2026-07-01T00:00:00+03:00', value: 8 },
              { date: '2026-07-02T00:00:00+03:00', value: 4 },
            ],
          },
        })
      );
      return;
    }
    if (url.pathname.endsWith('/search-queries/popular')) {
      if (url.searchParams.get('date_from') === '2026-05-01') {
        response.statusCode = 404;
        response.end(
          JSON.stringify({
            error_code: 'HOST_NOT_LOADED',
            error_message: 'Site data is not loaded',
          })
        );
        return;
      }
      const offset = Number(url.searchParams.get('offset'));
      popularOffsets.push(offset);
      const count = offset === 0 ? 500 : 1;
      response.end(
        JSON.stringify({
          count: 501,
          date_from: '2026-07-01',
          date_to: '2026-07-20',
          queries: Array.from({ length: count }, (_, index) => ({
            query_text: `query-${offset + index}`,
            indicators: {
              TOTAL_CLICKS: 1,
              TOTAL_SHOWS: 10,
              AVG_SHOW_POSITION: 5,
            },
          })),
        })
      );
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ error_code: 'NOT_FOUND' }));
  });

  try {
    await listen(server);
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const result = await runCli(
      [
        'snapshot',
        '--host',
        'https:example.com:443',
        '--start-date',
        '2026-07-01',
        '--end-date',
        '2026-07-20',
      ],
      {
        ...sharedEnvironment,
        YANDEX_WEBMASTER_API_BASE: `${baseUrl}/v4`,
        YANDEX_TOKEN_URL: `${baseUrl}/token`,
      }
    );
    assert.equal(result.code, 0, result.stderr);
    const summary = JSON.parse(result.stdout);
    assert.equal(summary.host.hostId, 'https:example.com:443');
    assert.equal(summary.datasets.summary.rowCount, 1);
    assert.equal(summary.datasets.date.rowCount, 2);
    assert.equal(summary.datasets.query.rowCount, 501);
    assert.equal(summary.datasets.query.pagesFetched, 2);
    assert.deepEqual(popularOffsets, [0, 500]);
    assert.equal(tokenRequests, 1);

    const snapshot = JSON.parse(await readFile(summary.path, 'utf8'));
    assert.deepEqual(snapshot.datasets.summary.rows[0], {
      clicks: 10,
      impressions: 100,
      ctr: 0.1,
      position: 4.8,
    });
    assert.equal(snapshot.datasets.query.dataCompleteness, 'top-queries');
    assert.equal(snapshot.datasets.query.rows[500].query, 'query-500');
    assert.equal((await readFile(summary.path, 'utf8')).includes('fresh-access-token'), false);
    assert.equal(
      (await readFile(path.join(configDirectory, 'token.json'), 'utf8')).includes(
        'rotated-refresh-token'
      ),
      true
    );
    assert.equal(
      (await readFile(path.join(configDirectory, 'token.json'), 'utf8')).includes(
        'initial-refresh-token'
      ),
      false
    );

    const unavailableResult = await runCli(
      [
        'snapshot',
        '--host',
        'https:example.com:443',
        '--start-date',
        '2026-05-01',
        '--end-date',
        '2026-05-20',
      ],
      {
        ...sharedEnvironment,
        YANDEX_WEBMASTER_API_BASE: `${baseUrl}/v4`,
        YANDEX_TOKEN_URL: `${baseUrl}/token`,
      }
    );
    assert.equal(unavailableResult.code, 0, unavailableResult.stderr);
    const unavailableSummary = JSON.parse(unavailableResult.stdout);
    assert.equal(
      unavailableSummary.dataAvailability.state,
      'host-not-loaded'
    );
    assert.equal(unavailableSummary.datasets.summary.rowCount, 0);
    assert.equal(unavailableSummary.datasets.date.rowCount, 0);
    assert.equal(unavailableSummary.datasets.query.rowCount, 0);
    const unavailableSnapshot = JSON.parse(
      await readFile(unavailableSummary.path, 'utf8')
    );
    assert.equal(
      unavailableSnapshot.datasets.summary.dataCompleteness,
      'unavailable'
    );

    const unsafeResult = await runCli(
      [
        'query',
        '--host',
        'https:example.com:443',
        '--dataset',
        'summary',
        '--start-date',
        '2026-07-01',
        '--end-date',
        '2026-07-20',
        '--output',
        path.join(repositoryRoot, 'unsafe-yandex-output.json'),
      ],
      {
        ...sharedEnvironment,
        YANDEX_WEBMASTER_API_BASE: `${baseUrl}/v4`,
        YANDEX_TOKEN_URL: `${baseUrl}/token`,
      }
    );
    assert.equal(unsafeResult.code, 1);
    assert.match(
      unsafeResult.stderr,
      /must stay outside Git repositories/
    );

    const snapshotsResult = await runCli(['snapshots'], sharedEnvironment);
    assert.equal(snapshotsResult.code, 0, snapshotsResult.stderr);
    const localSnapshots = JSON.parse(snapshotsResult.stdout);
    assert.equal(localSnapshots.snapshots.length, 1);
    assert.equal(
      localSnapshots.snapshots[0].host.hostId,
      'https:example.com:443'
    );
    assert.equal(
      localSnapshots.snapshots[0].dataAvailability.state,
      'host-not-loaded'
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(temporary, { recursive: true, force: true });
  }
});
