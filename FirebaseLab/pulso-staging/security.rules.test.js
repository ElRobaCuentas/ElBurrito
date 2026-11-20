import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { after, afterEach, before, test } from 'node:test';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';

const UID = 'B0KBCdOgh5cSpRKzwPAO9E2rEdl1';
const PLACEHOLDER = '__PULSO_BUS_ID_PENDING__';
const BUS_ID = 'PULSO-LOCAL-AUTHORIZED';
const PROJECT_ID = 'demo-pulso-staging-rules';
const HOST = '127.0.0.1';
const PORT = 19000;
const DATABASE_URL = `http://${HOST}:${PORT}/?ns=${PROJECT_ID}`;
const templateUrl = new URL('./database.rules.template.json', import.meta.url);
const templateText = await readFile(templateUrl, 'utf8');
const template = JSON.parse(templateText);
const sourceHash = createHash('sha256').update(templateText).digest('hex');

// Se sustituye solo la clave en memoria. BUS_ID es un fixture, no un bus real autorizado.
const candidate = structuredClone(template);
const tracking = candidate.rules.ubicacion_buses;
assert.ok(Object.hasOwn(tracking, PLACEHOLDER), 'La plantilla debe mantener el bus real pendiente');
tracking[BUS_ID] = tracking[PLACEHOLDER];
delete tracking[PLACEHOLDER];
const seed = {
  ubicacion_buses: {
    [BUS_ID]: { isActive: true, timestamp: 1_800_000_000_000, latitude: -12.05, longitude: -77.08 },
    'PULSO-OTHER-BUS': { isActive: false, timestamp: 1_799_999_000_000 },
  },
  privado: { [UID]: { secret: 'fixture privado local' } },
  administradores: { 'local-admin': { role: 'fixture local' } },
};
let environment;
let initialDataHash;
const database = context => context.database(DATABASE_URL);
const reader = () => database(environment.authenticatedContext(UID));
const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const dataHash = () => environment.withSecurityRulesDisabled(async context =>
  fingerprint((await database(context).ref('/').once('value')).val()));

before(async () => {
  assert.equal(process.env.PULSO_RULES_LOCAL_ONLY, '1', 'Usar únicamente run-tests.mjs');
  assert.equal(process.env.FIREBASE_DATABASE_EMULATOR_HOST, `${HOST}:${PORT}`);
  assert.ok(PROJECT_ID.startsWith('demo-'));
  environment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    database: { host: HOST, port: PORT, rules: JSON.stringify(candidate) },
  });
  await environment.withSecurityRulesDisabled(async context => database(context).ref('/').set(seed));
  initialDataHash = await dataHash();
});

afterEach(async () => {
  if (environment && initialDataHash) assert.equal(await dataHash(), initialDataHash, 'Ninguna prueba debe alterar los datos persistidos');
});
after(async () => {
  try {
    assert.equal(fingerprint(JSON.parse(await readFile(templateUrl, 'utf8'))), fingerprint(template));
    assert.equal(createHash('sha256').update(await readFile(templateUrl)).digest('hex'), sourceHash);
  } finally {
    await environment?.cleanup();
  }
});

test('la política completa solo concede una lectura y ninguna escritura', () => {
  assert.deepEqual(Object.keys(template.rules).sort(), ['.read', '.write', 'ubicacion_buses']);
  assert.equal(template.rules['.read'], false);
  assert.equal(template.rules['.write'], false);
  assert.deepEqual(Object.keys(template.rules.ubicacion_buses).sort(), ['.read', '.write', PLACEHOLDER]);
  assert.equal(template.rules.ubicacion_buses['.read'], false);
  assert.equal(template.rules.ubicacion_buses['.write'], false);
  assert.deepEqual(template.rules.ubicacion_buses[PLACEHOLDER], {
    '.read': `auth != null && auth.uid === '${UID}'`, '.write': false,
  });
});
test('el lector puede leer exactamente su bus y obtiene el fixture esperado', async () => {
  const snapshot = await assertSucceeds(reader().ref(`/ubicacion_buses/${BUS_ID}`).once('value'));
  assert.deepEqual(snapshot.val(), seed.ubicacion_buses[BUS_ID]);
});
test('la concesión permite leer un campo dentro del bus autorizado', async () => {
  const snapshot = await assertSucceeds(reader().ref(`/ubicacion_buses/${BUS_ID}/timestamp`).once('value'));
  assert.equal(snapshot.val(), seed.ubicacion_buses[BUS_ID].timestamp);
});
test('sin autenticación no puede leer el bus autorizado', async () => {
  await assertFails(database(environment.unauthenticatedContext()).ref(`/ubicacion_buses/${BUS_ID}`).once('value'));
});
test('otro UID no puede leer el bus autorizado aunque presente una claim admin', async () => {
  await assertFails(database(environment.authenticatedContext('PULSO-OTHER-UID', { admin: true })).ref(`/ubicacion_buses/${BUS_ID}`).once('value'));
});
test('el UID autorizado no puede leer otro bus', async () => {
  await assertFails(reader().ref('/ubicacion_buses/PULSO-OTHER-BUS').once('value'));
});
for (const target of ['/', '/ubicacion_buses', '/privado', `/privado/${UID}`, '/administradores']) {
  test(`el lector no puede leer ${target}`, async () => {
    await assertFails(reader().ref(target).once('value'));
  });
}
test('una consulta filtrada al nodo padre tampoco concede acceso', async () => {
  await assertFails(reader().ref('/ubicacion_buses').orderByKey().equalTo(BUS_ID).once('value'));
});
test('la clave pendiente de la plantilla no queda autorizada en las reglas de prueba', async () => {
  await assertFails(reader().ref(`/ubicacion_buses/${PLACEHOLDER}`).once('value'));
});
for (const target of ['/', '/ubicacion_buses', `/ubicacion_buses/${BUS_ID}`, `/ubicacion_buses/${BUS_ID}/timestamp`, '/ubicacion_buses/PULSO-OTHER-BUS', '/privado']) {
  for (const operation of ['set', 'update', 'remove']) {
    test(`el lector no puede ejecutar ${operation} en ${target}`, async () => {
      const reference = reader().ref(target);
      const pending = operation === 'remove' ? reference.remove()
        : operation === 'update' ? reference.update({ unauthorized: true })
          : reference.set({ unauthorized: true });
      await assertFails(pending);
    });
  }
}
test('una actualización multipath no puede escribir en su bus ni en un nodo ajeno', async () => {
  await assertFails(reader().ref('/').update({
    [`ubicacion_buses/${BUS_ID}/timestamp`]: 1_800_000_001_000,
    'privado/other/value': 'not allowed',
  }));
});

test('la matriz independiente comprueba identidad y clave exactas sin cambios persistidos', async () => {
  const deny = async action => {
    const before = await dataHash();
    await assertFails(action());
    assert.equal(await dataHash(), before);
  };
  for (const uid of [null, `${UID}x`, UID.toLowerCase()]) {
    const context = uid === null ? environment.unauthenticatedContext()
      : environment.authenticatedContext(uid, { admin: true });
    const db = database(context);
    await deny(() => db.ref(`/ubicacion_buses/${BUS_ID}`).once('value'));
    await deny(() => db.ref(`/ubicacion_buses/${BUS_ID}/timestamp`).set(2));
    await deny(() => db.ref(`/ubicacion_buses/${BUS_ID}`).remove());
  }
  for (const key of ['PULSO-OTHER-BUS', `${BUS_ID}x`, 'missing-bus', PLACEHOLDER]) {
    await deny(() => reader().ref(`/ubicacion_buses/${key}`).once('value'));
  }
  for (const target of ['/', '/ubicacion_buses', '/privado', '/missing']) {
    await deny(() => reader().ref(target).once('value'));
  }
  await deny(() => reader().ref('/ubicacion_buses').orderByKey().equalTo(BUS_ID).limitToFirst(1).once('value'));
  await deny(() => reader().ref('/').update({ [`ubicacion_buses/${BUS_ID}`]: null, privado: null }));
  const before = await dataHash();
  // El SDK instalado no siempre agrega code al error de una transacción denegada.
  await assert.rejects(reader().ref(`/ubicacion_buses/${BUS_ID}/timestamp`).transaction(() => 2),
    error => error.code === 'PERMISSION_DENIED' || error.message === 'permission_denied');
  assert.equal(await dataHash(), before);
});
