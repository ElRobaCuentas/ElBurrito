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
const EMPTY_UID = 'uid-sin-asignaciones-ficticio';
const EMPTY_DNI = '00777777';
const STUDENT_UID = 'uid-estudiante-ficticio';
const NO_LINK_UID = 'uid-sin-vinculo-ficticio';
const NO_LINK_DNI = '00555555';
const CROSSED_UID = 'uid-vinculo-cruzado-ficticio';
const NUMERIC_LINK_UID = 'uid-vinculo-numerico-ficticio';
const NUMERIC_DNI = '11223344';
const OBJECT_LINK_UID = 'uid-vinculo-objeto-ficticio';
const OBJECT_DNI = '00333333';
const OTHER_DNI = '00555555';
const NEW_DNI = '00888888';

const TODAY = '2026-11-03';

const assignment = (choferId, busId, fecha, activo = true, turnos = [{ inicio: 420, fin: 480 }]) => ({
  choferId,
  busId,
  fecha,
  activo,
  turnos,
  horaInicio: turnos[0].inicio,
  horaFin: turnos[0].fin,
  createdAt: 1,
  createdBy: ADMIN_UID,
});

let environment;
const database = context => context.database(DATABASE_URL);

before(async () => {
  const config = await loadConfiguration();
  await checkEmulators(config);
  console.log(`Preflight I03 asignaciones OK: ${PROJECT_ID}; política acumulativa I03+I04.`);
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
      choferes_uids: {
        [CARLOS_UID]: CARLOS_DNI,
        [LUIS_UID]: LUIS_DNI,
        [EMPTY_UID]: EMPTY_DNI,
        // Vínculo administrado que apunta a Carlos, no a Luis.
        [CROSSED_UID]: CARLOS_DNI,
        // Tipo incorrecto: número en lugar de string.
        [NUMERIC_LINK_UID]: Number(NUMERIC_DNI),
        // Tipo incorrecto: objeto en lugar de string.
        [OBJECT_LINK_UID]: { dni: OBJECT_DNI },
      },
      asignaciones: {
        // Carlos: histórica, de hoy, futura y cancelada.
        'asig-carlos-pasada': assignment(CARLOS_DNI, 'BUS-1', '2020-01-01'),
        'asig-carlos-hoy': assignment(CARLOS_DNI, 'BUS-1', TODAY),
        'asig-carlos-futura': assignment(CARLOS_DNI, 'BUS-2', '2099-12-31'),
        'asig-carlos-cancelada': assignment(CARLOS_DNI, 'BUS-3', '2099-12-31', false),
        // Luis comparte el bus de hoy con Carlos.
        'asig-luis-hoy': assignment(LUIS_DNI, 'BUS-1', TODAY),
        // Asignaciones dedicadas a las escrituras administrativas.
        'asig-luis-cancelar': assignment(LUIS_DNI, 'BUS-2', '2099-12-31'),
        'asig-luis-turnos': assignment(LUIS_DNI, 'BUS-3', '2099-12-31'),
        // Sin vínculo UID-DNI.
        'asig-otro': assignment(OTHER_DNI, 'BUS-4', TODAY),
        // Vínculos con tipo incorrecto.
        'asig-numerico': assignment(NUMERIC_DNI, 'BUS-4', TODAY),
        'asig-objeto': assignment(OBJECT_DNI, 'BUS-4', TODAY),
      },
      ubicacion_buses: {
        'BUS-1': { isActive: false, lat: 0, lng: 0 },
      },
    });
  });
});

after(async () => {
  if (environment) await environment.cleanup();
});

test('T1 - Administrador consulta todas las asignaciones', async () => {
  const db = database(environment.authenticatedContext(ADMIN_UID));
  const snapshot = await assertSucceeds(db.ref('/asignaciones').once('value'));
  const data = snapshot.val() ?? {};
  for (const key of [
    'asig-carlos-pasada', 'asig-carlos-hoy', 'asig-carlos-futura',
    'asig-carlos-cancelada', 'asig-luis-hoy', 'asig-otro',
    'asig-numerico', 'asig-objeto',
  ]) {
    assert.ok(data[key], `Falta la asignación ficticia ${key}.`);
  }
});

test('T2 - Administrador consulta una asignación individual', async () => {
  const db = database(environment.authenticatedContext(ADMIN_UID));
  const snapshot = await assertSucceeds(db.ref('/asignaciones/asig-carlos-hoy').once('value'));
  assert.equal(snapshot.val()?.choferId, CARLOS_DNI);
});

test('T3 - Conductor consulta sus asignaciones con la consulta exacta de DriverApp', async () => {
  const db = database(environment.authenticatedContext(CARLOS_UID));
  const snapshot = await assertSucceeds(
    db.ref('/asignaciones').orderByChild('choferId').equalTo(CARLOS_DNI).once('value'),
  );
  const data = snapshot.val() ?? {};
  assert.deepEqual(Object.keys(data).sort(), [
    'asig-carlos-cancelada', 'asig-carlos-futura', 'asig-carlos-hoy', 'asig-carlos-pasada',
  ]);
  for (const value of Object.values(data)) assert.equal(value.choferId, CARLOS_DNI);
});

test('T4 - Conductor no consulta las asignaciones de otro DNI', async () => {
  const db = database(environment.authenticatedContext(CARLOS_UID));
  await assertFails(
    db.ref('/asignaciones').orderByChild('choferId').equalTo(LUIS_DNI).once('value'),
  );
});

test('T5 - Conductor no descarga toda la colección sin filtro', async () => {
  const db = database(environment.authenticatedContext(CARLOS_UID));
  await assertFails(db.ref('/asignaciones').once('value'));
});

test('T6 - Conductor no puede ordenar por un campo distinto de choferId', async () => {
  const db = database(environment.authenticatedContext(CARLOS_UID));
  await assertFails(
    db.ref('/asignaciones').orderByChild('fecha').equalTo(TODAY).once('value'),
  );
});

test('T7 - Conductor no puede consultar sin equalTo', async () => {
  const db = database(environment.authenticatedContext(CARLOS_UID));
  await assertFails(db.ref('/asignaciones').orderByChild('choferId').once('value'));
});

test('T8 - Estudiante no consulta asignaciones propias ni ajenas', async () => {
  const db = database(environment.authenticatedContext(STUDENT_UID));
  await assertFails(
    db.ref('/asignaciones').orderByChild('choferId').equalTo(CARLOS_DNI).once('value'),
  );
  await assertFails(
    db.ref('/asignaciones').orderByChild('choferId').equalTo('00000000').once('value'),
  );
  await assertFails(db.ref('/asignaciones').once('value'));
});

test('T9 - Usuario no autenticado no consulta asignaciones', async () => {
  const db = database(environment.unauthenticatedContext());
  await assertFails(
    db.ref('/asignaciones').orderByChild('choferId').equalTo(CARLOS_DNI).once('value'),
  );
  await assertFails(db.ref('/asignaciones').once('value'));
});

test('T10 - Vínculo UID-DNI ausente no autoriza consultas', async () => {
  const db = database(environment.authenticatedContext(NO_LINK_UID));
  await assertFails(
    db.ref('/asignaciones').orderByChild('choferId').equalTo(NO_LINK_DNI).once('value'),
  );
});

test('T11 - Vínculo incorrecto, numérico u objeto no autoriza', async () => {
  const crossed = database(environment.authenticatedContext(CROSSED_UID));
  await assertFails(
    crossed.ref('/asignaciones').orderByChild('choferId').equalTo(LUIS_DNI).once('value'),
  );

  const numeric = database(environment.authenticatedContext(NUMERIC_LINK_UID));
  await assertFails(
    numeric.ref('/asignaciones').orderByChild('choferId').equalTo(NUMERIC_DNI).once('value'),
  );
  await assertFails(
    numeric.ref('/asignaciones').orderByChild('choferId').equalTo(Number(NUMERIC_DNI)).once('value'),
  );

  const object = database(environment.authenticatedContext(OBJECT_LINK_UID));
  await assertFails(
    object.ref('/asignaciones').orderByChild('choferId').equalTo(OBJECT_DNI).once('value'),
  );
});

test('T12 - DNI con ceros iniciales se compara correctamente', async () => {
  const db = database(environment.authenticatedContext(CARLOS_UID));
  await assertSucceeds(
    db.ref('/asignaciones').orderByChild('choferId').equalTo('00123456').once('value'),
  );
  await assertFails(
    db.ref('/asignaciones').orderByChild('choferId').equalTo('123456').once('value'),
  );
});

test('T13 - Consulta legítima sin asignaciones devuelve vacío, no PERMISSION_DENIED', async () => {
  const db = database(environment.authenticatedContext(EMPTY_UID));
  const snapshot = await assertSucceeds(
    db.ref('/asignaciones').orderByChild('choferId').equalTo(EMPTY_DNI).once('value'),
  );
  assert.equal(snapshot.exists(), false);
});

test('T14 - Administrador crea una asignación', async () => {
  const db = database(environment.authenticatedContext(ADMIN_UID));
  await assertSucceeds(db.ref('/asignaciones/asig-nueva-admin').set(
    assignment(NEW_DNI, 'BUS-5', '2099-12-31'),
  ));
  const snapshot = await assertSucceeds(db.ref('/asignaciones/asig-nueva-admin').once('value'));
  assert.equal(snapshot.val()?.busId, 'BUS-5');
});

test('T15 - Administrador cancela una asignación con activo:false', async () => {
  const db = database(environment.authenticatedContext(ADMIN_UID));
  await assertSucceeds(db.ref('/asignaciones/asig-luis-cancelar').update({ activo: false }));
  const snapshot = await assertSucceeds(db.ref('/asignaciones/asig-luis-cancelar').once('value'));
  assert.equal(snapshot.val()?.activo, false);
});

test('T16 - Administrador actualiza turnos', async () => {
  const db = database(environment.authenticatedContext(ADMIN_UID));
  const turnos = [{ inicio: 600, fin: 660 }, { inicio: 1200, fin: 1260 }];
  await assertSucceeds(db.ref('/asignaciones/asig-luis-turnos').update({
    turnos,
    horaInicio: 600,
    horaFin: 660,
  }));
  const snapshot = await assertSucceeds(db.ref('/asignaciones/asig-luis-turnos').once('value'));
  assert.deepEqual(snapshot.val()?.turnos, turnos);
});

test('T17 - Conductor no crea, modifica ni elimina asignaciones', async () => {
  const db = database(environment.authenticatedContext(CARLOS_UID));
  await assertFails(db.ref('/asignaciones/asig-intento-conductor').set(
    assignment(CARLOS_DNI, 'BUS-9', TODAY),
  ));
  await assertFails(db.ref('/asignaciones/asig-carlos-hoy').update({ busId: 'BUS-9' }));
  await assertFails(db.ref('/asignaciones/asig-luis-hoy').remove());
});

test('T18 - Estudiante no escribe asignaciones', async () => {
  const db = database(environment.authenticatedContext(STUDENT_UID));
  await assertFails(db.ref('/asignaciones/asig-intento-estudiante').set(
    assignment(CARLOS_DNI, 'BUS-9', TODAY),
  ));
});

test('T19 - Dos conductores pueden tener asignaciones para el mismo bus', async () => {
  const carlos = database(environment.authenticatedContext(CARLOS_UID));
  const luis = database(environment.authenticatedContext(LUIS_UID));

  const carlosSnapshot = await assertSucceeds(
    carlos.ref('/asignaciones').orderByChild('choferId').equalTo(CARLOS_DNI).once('value'),
  );
  const luisSnapshot = await assertSucceeds(
    luis.ref('/asignaciones').orderByChild('choferId').equalTo(LUIS_DNI).once('value'),
  );

  const carlosHoy = carlosSnapshot.val()?.['asig-carlos-hoy'];
  const luisHoy = luisSnapshot.val()?.['asig-luis-hoy'];
  assert.equal(carlosHoy?.busId, 'BUS-1');
  assert.equal(luisHoy?.busId, 'BUS-1');
  assert.equal(carlosSnapshot.val()?.['asig-luis-hoy'], undefined);
  assert.equal(luisSnapshot.val()?.['asig-carlos-hoy'], undefined);
});

test('T20 - La consulta filtrada devuelve históricas y futuras sin restricciones extra', async () => {
  const db = database(environment.authenticatedContext(CARLOS_UID));
  const snapshot = await assertSucceeds(
    db.ref('/asignaciones').orderByChild('choferId').equalTo(CARLOS_DNI).once('value'),
  );
  const data = snapshot.val() ?? {};
  assert.equal(data['asig-carlos-pasada']?.fecha, '2020-01-01');
  assert.equal(data['asig-carlos-hoy']?.fecha, TODAY);
  assert.equal(data['asig-carlos-futura']?.fecha, '2099-12-31');
  assert.equal(data['asig-carlos-cancelada']?.activo, false);
});

test('T21 - Administrador comprueba asignaciones antes de eliminar un bus', async () => {
  const db = database(environment.authenticatedContext(ADMIN_UID));
  const snapshot = await assertSucceeds(db.ref('/asignaciones').once('value'));
  const data = snapshot.val() ?? {};
  const activasDelBus = Object.values(data).filter(
    asignacion => asignacion.busId === 'BUS-1'
      && asignacion.activo === true
      && asignacion.fecha >= TODAY,
  );
  assert.deepEqual(activasDelBus.map(asignacion => asignacion.choferId).sort(), [
    CARLOS_DNI, LUIS_DNI,
  ]);
});

test('T22 - /ubicacion_buses conserva sus permisos originales', async () => {
  const admin = database(environment.authenticatedContext(ADMIN_UID));
  const driver = database(environment.authenticatedContext(CARLOS_UID));
  const student = database(environment.authenticatedContext(STUDENT_UID));
  const anonymous = database(environment.unauthenticatedContext());

  await assertSucceeds(admin.ref('/ubicacion_buses/BUS-2').set({
    isActive: false, lat: -12.0, lng: -77.0,
  }));
  await assertSucceeds(driver.ref('/ubicacion_buses/BUS-1').update({
    isActive: true, lat: -12.1, lng: -77.1,
  }));
  await assertFails(student.ref('/ubicacion_buses/BUS-1').update({ isActive: true }));
  await assertFails(anonymous.ref('/ubicacion_buses/BUS-1').update({ isActive: true }));
  await assertSucceeds(anonymous.ref('/ubicacion_buses/BUS-1').once('value'));
});

test('T23 - La consulta filtrada no habilita lecturas individuales directas', async () => {
  const db = database(environment.authenticatedContext(CARLOS_UID));
  await assertSucceeds(
    db.ref('/asignaciones').orderByChild('choferId').equalTo(CARLOS_DNI).once('value'),
  );
  await assertFails(db.ref('/asignaciones').once('value'));
  await assertFails(db.ref('/asignaciones/asig-carlos-hoy').once('value'));
  await assertFails(db.ref('/asignaciones/asig-luis-hoy').once('value'));
});

test('T24 - Administrador publica el directorio de choferes del día', async () => {
  const db = database(environment.authenticatedContext(ADMIN_UID));
  const entrada = { nombre: 'Carlos', apellidos: 'Ficticio' };
  await assertSucceeds(db.ref(`/directorio_choferes/${TODAY}/${CARLOS_DNI}`).set(entrada));
  const snapshot = await assertSucceeds(db.ref(`/directorio_choferes/${TODAY}`).once('value'));
  assert.deepEqual(snapshot.val(), { [CARLOS_DNI]: entrada });
});

test('T25 - Conductor lee el directorio del día pero no puede modificarlo', async () => {
  const db = database(environment.authenticatedContext(CARLOS_UID));
  await assertSucceeds(db.ref(`/directorio_choferes/${TODAY}`).once('value'));
  await assertFails(db.ref(`/directorio_choferes/${TODAY}/${LUIS_DNI}`).set({
    nombre: 'Luis', apellidos: 'Ficticio',
  }));
});

test('T26 - Usuario no autenticado no lee el directorio del día', async () => {
  const db = database(environment.unauthenticatedContext());
  await assertFails(db.ref(`/directorio_choferes/${TODAY}`).once('value'));
});
