import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import {
  ROOT, PROJECT_ID, DATABASE_URL, loadConfiguration, validateConfiguration, checkEmulators,
} from '../lab.js';

let environment;
let config;
const database = context => context.database(DATABASE_URL);

before(async () => {
  config = await loadConfiguration();
  await checkEmulators(config);
  console.log(`Preflight OK: ${PROJECT_ID}; Authentication y RTDB responden en loopback.`);
  environment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    database: {
      host: config.emulators.database.host,
      port: config.emulators.database.port,
      rules: await readFile(path.join(ROOT, 'database.rules.json'), 'utf8'),
    },
  });
  await environment.withSecurityRulesDisabled(async context => {
    await database(context).ref('/').set({
      publico: { aviso: 'Dato ficticio del laboratorio' },
      privado: {
        'uid-carlos-ficticio': { dato: 'Solo Carlos' },
        'uid-luis-ficticio': { dato: 'Solo Luis' },
      },
      bloqueado: { dato: 'No modificar' },
    });
  });
});

after(async () => {
  if (environment) await environment.cleanup();
});

test('T1 - Lectura pública sin autenticación', async () => {
  const db = database(environment.unauthenticatedContext());
  const snapshot = await assertSucceeds(db.ref('/publico/aviso').once('value'));
  assert.equal(snapshot.val(), 'Dato ficticio del laboratorio');
});

test('T2 - Lectura privada sin autenticación rechazada', async () => {
  const db = database(environment.unauthenticatedContext());
  await assertFails(db.ref('/privado/uid-carlos-ficticio').once('value'));
});

test('T3 - Lectura privada del propietario permitida', async () => {
  const db = database(environment.authenticatedContext('uid-carlos-ficticio'));
  const snapshot = await assertSucceeds(db.ref('/privado/uid-carlos-ficticio/dato').once('value'));
  assert.equal(snapshot.val(), 'Solo Carlos');
});

test('T4 - Lectura de otro UID rechazada', async () => {
  const db = database(environment.authenticatedContext('uid-carlos-ficticio'));
  await assertFails(db.ref('/privado/uid-luis-ficticio').once('value'));
});

test('T5 - Escritura prohibida rechazada', async () => {
  const db = database(environment.authenticatedContext('uid-carlos-ficticio'));
  await assertFails(db.ref('/bloqueado/dato').set('Cambio no permitido'));
});

test('T6 - Configuración insegura o emuladores ausentes bloquean la ejecución', async () => {
  assert.throws(() => validateConfiguration(config, {}, 'proyecto-no-demo'));
  assert.throws(() => validateConfiguration(config, {}, 'demo-otro-laboratorio'));
  const wrongInstance = structuredClone(config);
  wrongInstance.database[0].instance = 'otra-instancia-ficticia';
  assert.throws(() => validateConfiguration(wrongInstance, {}));
  for (const name of ['auth', 'database', 'hub', 'logging']) {
    const external = structuredClone(config);
    external.emulators[name].host = 'servidor.invalid';
    assert.throws(() => validateConfiguration(external, {}));
    const publicBind = structuredClone(config);
    publicBind.emulators[name].host = '0.0.0.0';
    assert.throws(() => validateConfiguration(publicBind, {}));
    const wrongPort = structuredClone(config);
    wrongPort.emulators[name].port += 1;
    assert.throws(() => validateConfiguration(wrongPort, {}));
  }
  for (const name of ['GCLOUD_PROJECT', 'GOOGLE_CLOUD_PROJECT', 'FIREBASE_PROJECT_ID',
    'FIREBASE_AUTH_EMULATOR_HOST', 'FIREBASE_DATABASE_EMULATOR_HOST', 'FIREBASE_EMULATOR_HUB',
    'FIREBASE_CONFIG', 'GOOGLE_APPLICATION_CREDENTIALS', 'FIREBASE_TOKEN']) {
    assert.throws(() => validateConfiguration(config, { [name]: 'valor-inseguro-ficticio' }));
  }
  for (const missing of ['auth', 'database']) {
    const calls = [];
    await assert.rejects(checkEmulators(config, async url => {
      calls.push(url);
      if (url.includes(missing === 'auth' ? ':9099/' : ':9000/')) throw new Error('Emulador ausente');
      return { signIn: { allowDuplicateEmails: false } };
    }), /Emulador ausente/);
    assert.ok(calls.every(url => url.startsWith('http://127.0.0.1:')));
  }
  console.log('T6: proyectos, hosts, puertos, entorno contradictorio y servicios ausentes rechazados sin tráfico externo.');
});
