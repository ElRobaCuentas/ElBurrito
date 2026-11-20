import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import {
  ROOT, PROJECT_ID, DATABASE_URL, loadConfiguration, checkEmulators,
} from '../lab.js';

const ADMIN_UID = 'uid-admin-ficticio';
const CARLOS_UID = 'uid-carlos-ficticio';
const CARLOS_DNI = '00123456';
const LUIS_UID = 'uid-luis-ficticio';
const LUIS_DNI = '00987654';
const STUDENT_UID = 'uid-estudiante-ficticio';
const NO_LINK_UID = 'uid-sin-vinculo-ficticio';
const NO_LINK_DNI = '00555555';
const CROSSED_UID = 'uid-vinculo-cruzado-ficticio';
const NUMERIC_LINK_UID = 'uid-vinculo-numerico-ficticio';
const NUMERIC_DNI = '11223344';
const OBJECT_LINK_UID = 'uid-vinculo-objeto-ficticio';
const OBJECT_DNI = '00333333';
const HISTORIC_UID = 'uid-historico-ficticio';
const HISTORIC_DNI = '00777777';
const NEW_DNI = '00888888';
const NEW_UID = 'uid-nuevo-ficticio';

let environment;
const database = context => context.database(DATABASE_URL);

const profile = (nombre, apellidos, uid) => ({
  nombre,
  apellidos,
  activo: true,
  creadoEn: 1,
  creadoPor: ADMIN_UID,
  ...(uid ? { uid } : {}),
});

before(async () => {
  const config = await loadConfiguration();
  await checkEmulators(config);
  console.log(`Preflight I03 OK: ${PROJECT_ID}; política acumulativa I03+I04.`);
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
      administradores: {
        [ADMIN_UID]: {
          dni: '90000001',
          nombres: 'Admin',
          apellidos: 'Ficticio',
          correo: '90000001@admin.invalid',
        },
      },
      choferes: {
        [CARLOS_DNI]: profile('Carlos', 'Ficticio', CARLOS_UID),
        [LUIS_DNI]: profile('Luis', 'Ficticio', LUIS_UID),
        // El perfil declara un uid, pero no existe vínculo UID-DNI.
        [NO_LINK_DNI]: profile('Sin vínculo', 'Ficticio', NO_LINK_UID),
        [NUMERIC_DNI]: profile('Numérico', 'Ficticio', NUMERIC_LINK_UID),
        [OBJECT_DNI]: profile('Objeto', 'Ficticio', OBJECT_LINK_UID),
        // Registro histórico: no tiene el campo opcional uid.
        [HISTORIC_DNI]: profile('Histórico', 'Ficticio'),
      },
      choferes_uids: {
        [CARLOS_UID]: CARLOS_DNI,
        [LUIS_UID]: LUIS_DNI,
        // Vínculo administrado que apunta a Carlos, no al perfil que intentará leer.
        [CROSSED_UID]: CARLOS_DNI,
        // Tipo incorrecto: número en lugar de string.
        [NUMERIC_LINK_UID]: Number(NUMERIC_DNI),
        // Tipo incorrecto: objeto en lugar de string.
        [OBJECT_LINK_UID]: { dni: OBJECT_DNI },
        [HISTORIC_UID]: HISTORIC_DNI,
      },
    });
  });
});

after(async () => {
  if (environment) await environment.cleanup();
});

test('T1 - Administrador consulta el catálogo completo', async () => {
  const db = database(environment.authenticatedContext(ADMIN_UID));
  const snapshot = await assertSucceeds(db.ref('/choferes').once('value'));
  const data = snapshot.val();
  for (const dni of [CARLOS_DNI, LUIS_DNI, NO_LINK_DNI, NUMERIC_DNI, OBJECT_DNI, HISTORIC_DNI]) {
    assert.ok(data?.[dni], `Falta el conductor ficticio ${dni}.`);
  }
});

test('T2 - Administrador consulta un perfil individual', async () => {
  const db = database(environment.authenticatedContext(ADMIN_UID));
  const snapshot = await assertSucceeds(db.ref(`/choferes/${CARLOS_DNI}`).once('value'));
  assert.equal(snapshot.val()?.nombre, 'Carlos');
});

test('T3 - Conductor consulta su propio perfil', async () => {
  const db = database(environment.authenticatedContext(CARLOS_UID));
  const snapshot = await assertSucceeds(db.ref(`/choferes/${CARLOS_DNI}`).once('value'));
  assert.equal(snapshot.val()?.nombre, 'Carlos');
});

test('T4 - Conductor consulta el perfil de otro conductor', async () => {
  const db = database(environment.authenticatedContext(CARLOS_UID));
  await assertFails(db.ref(`/choferes/${LUIS_DNI}`).once('value'));
});

test('T5 - Conductor descarga el catálogo completo', async () => {
  const db = database(environment.authenticatedContext(CARLOS_UID));
  await assertFails(db.ref('/choferes').once('value'));
});

test('T6 - Estudiante consulta el catálogo', async () => {
  const db = database(environment.authenticatedContext(STUDENT_UID));
  await assertFails(db.ref('/choferes').once('value'));
});

test('T7 - Estudiante consulta un perfil individual', async () => {
  const db = database(environment.authenticatedContext(STUDENT_UID));
  await assertFails(db.ref(`/choferes/${CARLOS_DNI}`).once('value'));
});

test('T8 - Usuario no autenticado no consulta conductores', async () => {
  const db = database(environment.unauthenticatedContext());
  await assertFails(db.ref('/choferes').once('value'));
  await assertFails(db.ref(`/choferes/${CARLOS_DNI}`).once('value'));
});

test('T9 - Vínculo UID-DNI ausente no autoriza', async () => {
  const db = database(environment.authenticatedContext(NO_LINK_UID));
  await assertFails(db.ref(`/choferes/${NO_LINK_DNI}`).once('value'));
});

test('T10 - Vínculo con otro DNI no autoriza perfiles ajenos', async () => {
  const db = database(environment.authenticatedContext(CROSSED_UID));
  await assertFails(db.ref(`/choferes/${LUIS_DNI}`).once('value'));
});

test('T11 - Vínculo numérico no supera la comparación de DNI string', async () => {
  const db = database(environment.authenticatedContext(NUMERIC_LINK_UID));
  await assertFails(db.ref(`/choferes/${NUMERIC_DNI}`).once('value'));
});

test('T12 - Administrador crea un conductor', async () => {
  const db = database(environment.authenticatedContext(ADMIN_UID));
  await assertSucceeds(db.ref(`/choferes/${NEW_DNI}`).set({
    nombre: 'Nuevo',
    apellidos: 'Ficticio',
    activo: true,
    uid: NEW_UID,
    creadoEn: 2,
    creadoPor: ADMIN_UID,
  }));
  // El alta real de AdminWeb también escribe el vínculo UID-DNI.
  await assertSucceeds(db.ref(`/choferes_uids/${NEW_UID}`).set(NEW_DNI));
  const snapshot = await assertSucceeds(db.ref(`/choferes/${NEW_DNI}`).once('value'));
  assert.equal(snapshot.val()?.nombre, 'Nuevo');
});

test('T13 - Administrador actualiza nombre, apellidos y estado', async () => {
  const db = database(environment.authenticatedContext(ADMIN_UID));
  await assertSucceeds(db.ref(`/choferes/${CARLOS_DNI}`).update({
    nombre: 'Carlos Editado',
    apellidos: 'Ficticio Editado',
    activo: false,
  }));
  const snapshot = await assertSucceeds(db.ref(`/choferes/${CARLOS_DNI}`).once('value'));
  assert.equal(snapshot.val()?.nombre, 'Carlos Editado');
  assert.equal(snapshot.val()?.apellidos, 'Ficticio Editado');
  assert.equal(snapshot.val()?.activo, false);
});

test('T14 - Conductor intenta modificar un perfil', async () => {
  const db = database(environment.authenticatedContext(CARLOS_UID));
  await assertFails(db.ref(`/choferes/${CARLOS_DNI}`).update({ nombre: 'No permitido' }));
  await assertFails(db.ref(`/choferes_uids/${CARLOS_UID}`).set(LUIS_DNI));
});

test('T15 - Estudiante intenta modificar un perfil', async () => {
  const db = database(environment.authenticatedContext(STUDENT_UID));
  await assertFails(db.ref(`/choferes/${CARLOS_DNI}`).update({ nombre: 'No permitido' }));
  await assertFails(db.ref(`/choferes_uids/${STUDENT_UID}`).set(CARLOS_DNI));
});

test('T16 - Lectura directa de /choferes_uids sigue bloqueada', async () => {
  for (const uid of [ADMIN_UID, CARLOS_UID, STUDENT_UID]) {
    const db = database(environment.authenticatedContext(uid));
    await assertFails(db.ref('/choferes_uids').once('value'));
    await assertFails(db.ref(`/choferes_uids/${CARLOS_UID}`).once('value'));
  }
  const anonymous = database(environment.unauthenticatedContext());
  await assertFails(anonymous.ref('/choferes_uids').once('value'));
});

test('T17 - Perfil histórico sin uid con vínculo válido sigue accesible', async () => {
  const own = database(environment.authenticatedContext(HISTORIC_UID));
  const snapshot = await assertSucceeds(own.ref(`/choferes/${HISTORIC_DNI}`).once('value'));
  assert.equal(snapshot.val()?.nombre, 'Histórico');
  assert.equal(snapshot.val()?.uid, undefined);

  const other = database(environment.authenticatedContext(CARLOS_UID));
  await assertFails(other.ref(`/choferes/${HISTORIC_DNI}`).once('value'));
});

test('T18 - Vínculo con objeto no autoriza', async () => {
  const db = database(environment.authenticatedContext(OBJECT_LINK_UID));
  await assertFails(db.ref(`/choferes/${OBJECT_DNI}`).once('value'));
});
