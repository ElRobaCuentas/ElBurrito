import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { serverTimestamp } from 'firebase/database';
import {
  ROOT, PROJECT_ID, DATABASE_URL, loadConfiguration, checkEmulators,
} from '../lab.js';

const STUDENT_UID = 'uid-estudiante-ficticio';
const OTHER_UID = 'uid-otro-estudiante-ficticio';
const EXISTING_ID = 'comentario-existente-ficticio';

const comment = (uid = STUDENT_UID) => ({
  username: 'Carlos',
  avatar: 'ingeniero',
  rating: 4,
  mensaje: 'Buen servicio',
  uid,
  email: 'carlos@example.invalid',
  timestamp: 1718000000000,
});

let environment;
const database = context => context.database(DATABASE_URL);
const readRaw = async path => {
  let snapshot;
  await environment.withSecurityRulesDisabled(async context => {
    snapshot = await database(context).ref(path).once('value');
  });
  return snapshot;
};

before(async () => {
  const config = await loadConfiguration();
  await checkEmulators(config);
  console.log(`Preflight I04 OK: ${PROJECT_ID}; política acumulativa de comentarios.`);
  environment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    database: {
      host: config.emulators.database.host,
      port: config.emulators.database.port,
      rules: await readFile(path.join(ROOT, 'rules', 'i03-i04.rules.json'), 'utf8'),
    },
  });
  await environment.withSecurityRulesDisabled(async context => {
    await database(context).ref('/').set({
      comentarios: {
        [EXISTING_ID]: comment(),
      },
    });
  });
});

after(async () => {
  if (environment) await environment.cleanup();
});

test('T1 - Estudiante autenticado crea un comentario con su propio UID', async () => {
  const db = database(environment.authenticatedContext(STUDENT_UID));
  await assertSucceeds(db.ref('/comentarios/comentario-propio').set(comment()));
  const snapshot = await readRaw('/comentarios/comentario-propio');
  assert.equal(snapshot.val()?.uid, STUDENT_UID);
});

test('T2 - No se puede declarar el UID de otro estudiante', async () => {
  const db = database(environment.authenticatedContext(STUDENT_UID));
  await assertFails(db.ref('/comentarios/comentario-ajeno').set(comment(OTHER_UID)));
});

test('T3 - No se puede crear un comentario sin UID', async () => {
  const db = database(environment.authenticatedContext(STUDENT_UID));
  const { uid, ...withoutUid } = comment();
  await assertFails(db.ref('/comentarios/comentario-sin-uid').set(withoutUid));
});

test('T4 - Usuario no autenticado no crea comentarios', async () => {
  const db = database(environment.unauthenticatedContext());
  await assertFails(db.ref('/comentarios/comentario-anonimo').set(comment()));
});

test('T5 - No se puede sobrescribir un comentario existente', async () => {
  const db = database(environment.authenticatedContext(STUDENT_UID));
  await assertFails(db.ref(`/comentarios/${EXISTING_ID}`).set({
    ...comment(),
    mensaje: 'Texto reemplazado',
  }));
});

test('T6 - No se puede modificar parcialmente un comentario existente', async () => {
  const db = database(environment.authenticatedContext(STUDENT_UID));
  await assertFails(db.ref(`/comentarios/${EXISTING_ID}`).update({ rating: 5 }));
});

test('T7 - No se puede eliminar un comentario individual', async () => {
  const db = database(environment.authenticatedContext(STUDENT_UID));
  await assertFails(db.ref(`/comentarios/${EXISTING_ID}`).remove());
});

test('T8 - No se puede borrar la colección de comentarios', async () => {
  const db = database(environment.authenticatedContext(STUDENT_UID));
  await assertFails(db.ref('/comentarios').remove());
});

test('T9 - La lectura de comentarios sigue denegada', async () => {
  const student = database(environment.authenticatedContext(STUDENT_UID));
  const anonymous = database(environment.unauthenticatedContext());
  await assertFails(student.ref('/comentarios').once('value'));
  await assertFails(student.ref(`/comentarios/${EXISTING_ID}`).once('value'));
  await assertFails(anonymous.ref('/comentarios').once('value'));
  await assertFails(anonymous.ref(`/comentarios/${EXISTING_ID}`).once('value'));
});

test('T10 - Las calificaciones enteras de 1 a 5 son válidas', async () => {
  const db = database(environment.authenticatedContext(STUDENT_UID));
  for (const rating of [1, 2, 3, 4, 5]) {
    await assertSucceeds(db.ref(`/comentarios/comentario-rating-${rating}`).set({
      ...comment(),
      rating,
    }));
  }
});

test('T11 - Calificaciones fuera de rango o con tipo incorrecto son rechazadas', async () => {
  const db = database(environment.authenticatedContext(STUDENT_UID));
  for (const [id, rating] of [
    ['cero', 0],
    ['seis', 6],
    ['decimal', 4.5],
    ['texto', '4'],
    ['booleano', true],
  ]) {
    await assertFails(db.ref(`/comentarios/comentario-rating-${id}`).set({
      ...comment(),
      rating,
    }));
  }
});

test('T12 - El mensaje vacío es aceptado', async () => {
  const db = database(environment.authenticatedContext(STUDENT_UID));
  await assertSucceeds(db.ref('/comentarios/comentario-mensaje-vacio').set({
    ...comment(),
    mensaje: '',
  }));
});

test('T13 - El timestamp de servidor se resuelve como número', async () => {
  const db = database(environment.authenticatedContext(STUDENT_UID));
  await assertSucceeds(db.ref('/comentarios/comentario-timestamp').set({
    ...comment(),
    timestamp: serverTimestamp(),
  }));
  const snapshot = await readRaw('/comentarios/comentario-timestamp');
  assert.equal(typeof snapshot.val()?.timestamp, 'number');
  assert.ok(snapshot.val().timestamp > 0);
});

test('T14 - Se conserva el payload actual completo', async () => {
  const db = database(environment.authenticatedContext(STUDENT_UID));
  const payload = {
    username: 'Carlos',
    avatar: 'ingeniero',
    rating: 4,
    mensaje: 'Buen servicio',
    uid: STUDENT_UID,
    email: 'carlos@example.invalid',
    timestamp: 1718000000000,
  };
  await assertSucceeds(db.ref('/comentarios/comentario-payload').set(payload));
  const snapshot = await readRaw('/comentarios/comentario-payload');
  assert.deepEqual(snapshot.val(), payload);
});

test('T15 - La creación múltiple es atómica y no admite sobrescrituras', async () => {
  const db = database(environment.authenticatedContext(STUDENT_UID));
  await assertSucceeds(db.ref('/').update({
    'comentarios/comentario-multipath-1': comment(),
    'comentarios/comentario-multipath-2': { ...comment(), rating: 5 },
  }));

  assert.ok((await readRaw('/comentarios/comentario-multipath-1')).exists());
  assert.ok((await readRaw('/comentarios/comentario-multipath-2')).exists());

  await assertFails(db.ref('/').update({
    'comentarios/comentario-multipath-3': comment(),
    [`comentarios/${EXISTING_ID}`]: comment(),
  }));
  assert.equal((await readRaw('/comentarios/comentario-multipath-3')).exists(), false);
});

test('T16 - No se puede escribir directamente sobre el nodo padre', async () => {
  const db = database(environment.authenticatedContext(STUDENT_UID));
  await assertFails(db.ref('/comentarios').set({
    'comentario-padre': comment(),
  }));
});

test('T17 - Faltan campos obligatorios y la escritura es rechazada', async () => {
  const db = database(environment.authenticatedContext(STUDENT_UID));
  const { uid, ...withoutUid } = comment();
  const { rating, ...withoutRating } = comment();
  await assertFails(db.ref('/comentarios/comentario-sin-uid-2').set(withoutUid));
  await assertFails(db.ref('/comentarios/comentario-sin-rating').set(withoutRating));
  await assertFails(db.ref('/comentarios/comentario-vacio').set({}));
});

test('T18 - El UID debe coincidir exactamente con la identidad autenticada', async () => {
  const db = database(environment.authenticatedContext(STUDENT_UID));
  for (const [id, uid] of [
    ['otro-uid', OTHER_UID],
    ['sufijo', `${STUDENT_UID}-otro`],
    ['mayusculas', STUDENT_UID.toUpperCase()],
    ['numero', 12345],
  ]) {
    await assertFails(db.ref(`/comentarios/comentario-autor-${id}`).set({
      ...comment(),
      uid,
    }));
  }
  await assertSucceeds(db.ref('/comentarios/comentario-autor-exacto').set(comment()));
});
