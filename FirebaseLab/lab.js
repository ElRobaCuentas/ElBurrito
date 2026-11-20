import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ID = 'demo-el-burrito-i03i04';
export const HOST = '127.0.0.1';
const PORTS = { auth: 9099, database: 9000, hub: 4400, logging: 4500 };
export const DATABASE_URL = `http://${HOST}:${PORTS.database}/?ns=${PROJECT_ID}`;
const REGRESSION_TEST_FILES = 'tests/rules.test.js tests/i03-choferes.test.js tests/i03-asignaciones.test.js tests/i04-comentarios.test.js';
const INTEGRATION_TEST_FILES = 'tests/auth-rtdb.integration.test.js';
const TEST_FILES = {
  test: REGRESSION_TEST_FILES,
  integration: INTEGRATION_TEST_FILES,
  all: `${INTEGRATION_TEST_FILES} ${REGRESSION_TEST_FILES}`,
};

// Una sola frontera de configuración, antes de crear clientes o cargar fixtures.
export function validateConfiguration(config, env = process.env, projectId = PROJECT_ID) {
  assert.ok(projectId.startsWith('demo-'), 'El proyecto debe ser demo-.');
  assert.equal(projectId, PROJECT_ID, 'Proyecto distinto del laboratorio.');
  assert.deepEqual(Object.keys(config).sort(), ['database', 'emulators']);
  assert.deepEqual(config.database, [{ instance: PROJECT_ID, rules: 'database.rules.json' }]);
  assert.deepEqual(Object.keys(config.emulators).sort(),
    ['auth', 'database', 'hub', 'logging', 'singleProjectMode', 'ui']);
  for (const [name, port] of Object.entries(PORTS)) {
    assert.deepEqual(config.emulators[name], { host: HOST, port }, `Endpoint inseguro: ${name}.`);
  }
  assert.deepEqual(config.emulators.ui, { enabled: false });
  assert.equal(config.emulators.singleProjectMode, true);
  for (const name of ['GCLOUD_PROJECT', 'GOOGLE_CLOUD_PROJECT', 'FIREBASE_PROJECT_ID']) {
    if (env[name] !== undefined) assert.equal(env[name], PROJECT_ID, `${name} contradictorio.`);
  }
  for (const [name, expected] of Object.entries({
    FIREBASE_AUTH_EMULATOR_HOST: `${HOST}:${PORTS.auth}`,
    FIREBASE_DATABASE_EMULATOR_HOST: `${HOST}:${PORTS.database}`,
    FIREBASE_EMULATOR_HUB: `${HOST}:${PORTS.hub}`,
  })) {
    if (env[name] !== undefined) assert.equal(env[name], expected, `${name} inseguro.`);
  }
  assert.ok(!env.GOOGLE_APPLICATION_CREDENTIALS && !env.FIREBASE_TOKEN,
    'El laboratorio no acepta credenciales de servicios reales.');
  if (env.FIREBASE_CONFIG !== undefined) {
    assert.deepEqual(JSON.parse(env.FIREBASE_CONFIG), {
      projectId: PROJECT_ID, databaseURL: DATABASE_URL,
    }, 'FIREBASE_CONFIG debe contener solamente la configuración local.');
  }
  return config;
}

export async function loadConfiguration() {
  return validateConfiguration(JSON.parse(await readFile(path.join(ROOT, 'firebase.json'), 'utf8')));
}

async function localJson(url, options = {}) {
  const parsed = new URL(url);
  assert.equal(parsed.protocol, 'http:');
  assert.equal(parsed.hostname, HOST);
  assert.ok([String(PORTS.auth), String(PORTS.database)].includes(parsed.port));
  const response = await fetch(parsed, {
    ...options, redirect: 'error', signal: AbortSignal.timeout(3000),
  });
  assert.ok(response.ok, `Emulador no disponible en ${parsed.host}${parsed.pathname} (${response.status}).`);
  return response.json();
}

export async function checkEmulators(config, request = localJson) {
  validateConfiguration(config);
  const authConfig = await request(
    `http://${HOST}:${PORTS.auth}/emulator/v1/projects/${PROJECT_ID}/config`,
  );
  assert.equal(typeof authConfig?.signIn?.allowDuplicateEmails, 'boolean',
    'No respondió Authentication Emulator.');
  // Lectura de reglas SOLO del emulador: no crea usuarios ni escribe fixtures.
  const rules = await request(
    `http://${HOST}:${PORTS.database}/.settings/rules.json?ns=${PROJECT_ID}`,
    { headers: { Authorization: 'Bearer owner' } },
  );
  assert.ok(rules && typeof rules.rules === 'object', 'No respondió RTDB Emulator.');
}

async function waitForEmulators(config) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    try {
      await checkEmulators(config);
      return;
    } catch {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  throw new Error('Los emuladores no respondieron a tiempo.');
}

async function requireFreePorts() {
  for (const port of Object.values(PORTS)) {
    await new Promise((resolve, reject) => {
      const server = createServer();
      server.once('error', () => reject(new Error(`Puerto ${port} ocupado; no se inicia el laboratorio.`)));
      server.listen({ host: HOST, port, exclusive: true }, () => server.close(resolve));
    });
  }
}

async function main(mode) {
  assert.ok(['test', 'integration', 'all', 'emulators', 'b2'].includes(mode),
    'Uso: node lab.js test|integration|all|emulators|b2');
  const config = await loadConfiguration();
  await requireFreePorts();
  const javaHome = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Android', 'Android Studio', 'jbr');
  const java = spawnSync(path.join(javaHome, 'bin', 'java.exe'), ['-version'], { encoding: 'utf8' });
  assert.equal(java.status, 0, 'No se pudo ejecutar el Java de Android Studio.');
  assert.match(java.stderr + java.stdout, /version "21\./, 'Se requiere Java 21.');
  const cli = path.join(process.env.APPDATA, 'npm', 'node_modules', 'firebase-tools', 'lib', 'bin', 'firebase.js');
  const cliPackage = JSON.parse(await readFile(path.resolve(path.dirname(cli), '../../package.json'), 'utf8'));
  assert.equal(cliPackage.version, '15.20.0', 'Verificar compatibilidad antes de cambiar Firebase CLI.');
  const env = {
    ...process.env,
    JAVA_HOME: javaHome,
    PATH: `${path.join(javaHome, 'bin')}${path.delimiter}${process.env.PATH}`,
    GCLOUD_PROJECT: PROJECT_ID,
    GOOGLE_CLOUD_PROJECT: PROJECT_ID,
    FIREBASE_CONFIG: JSON.stringify({ projectId: PROJECT_ID, databaseURL: DATABASE_URL }),
    FIREBASE_EMULATORS_PATH: path.join(ROOT, '.cache', 'emulators'),
    FIREBASE_CLI_DISABLE_MOTD: '1',
  };
  const isInteractive = mode === 'emulators' || mode === 'b2';
  const args = [cli, isInteractive ? 'emulators:start' : 'emulators:exec',
    '--project', PROJECT_ID, '--config', path.join(ROOT, 'firebase.json'),
    '--only', 'auth,database', '--non-interactive'];
  if (!isInteractive) args.push(`node --test --test-concurrency=1 --test-timeout=30000 ${TEST_FILES[mode]}`);
  console.log(`Laboratorio: ${PROJECT_ID}; Auth ${HOST}:9099; RTDB ${HOST}:9000; Java 21; CLI ${cliPackage.version}; modo ${mode}`);
  const child = spawn(process.execPath, args, { cwd: ROOT, env, stdio: 'inherit' });
  // Ctrl+C llega también a la CLI en la consola; dejarla cerrar sus emuladores.
  const onInterrupt = () => {};
  process.on('SIGINT', onInterrupt);
  try {
    if (mode === 'b2') {
      await waitForEmulators(config);
      console.log('B2: emuladores listos; cargando candidata y datos ficticios.');
      const seed = spawnSync(process.execPath, [path.join(ROOT, 'b2-seed.js')], {
        cwd: ROOT, env, stdio: 'inherit',
      });
      if (seed.status !== 0) {
        child.kill('SIGINT');
        throw new Error(`La carga de datos B2 falló con código ${seed.status}.`);
      }
    }
    process.exitCode = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code) => resolve(code ?? 1));
    });
  } finally {
    process.removeListener('SIGINT', onInterrupt);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv[2]).catch(error => {
    console.error(`Laboratorio bloqueado: ${error.message}`);
    process.exitCode = 1;
  });
}
