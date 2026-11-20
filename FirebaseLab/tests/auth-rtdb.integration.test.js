import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteApp, initializeApp } from 'firebase/app';
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  inMemoryPersistence,
  initializeAuth,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import {
  connectDatabaseEmulator,
  equalTo,
  get,
  getDatabase,
  orderByChild,
  push,
  query,
  ref,
  serverTimestamp,
  set,
  update,
} from 'firebase/database';
import {
  DATABASE_URL,
  HOST,
  PROJECT_ID,
  ROOT,
  checkEmulators,
  loadConfiguration,
} from '../lab.js';

const RULES_FILE = path.join(ROOT, 'rules', 'i03-i04.rules.json');
const RULES_SHA256 = '0BFAC5C2D900F6900B3E975D6CEFA7A34DBC38DCF6929A4D5C4FD2BA283359C2';
const PASSWORD = 'B1-Ficticio-2026!';
const ADMIN = { email: '90000001@admin.invalid' };
const DRIVER_A = { dni: '31000001', email: '31000001@conductor.com' };
const DRIVER_B = { dni: '00123457', email: '00123457@conductor.com' };
const STUDENT = { email: 'estudiante.b1@example.invalid' };
const BUS_ID = 'BUS-B1';
const TODAY = '2026-11-03';
const CANCEL_DATE = '2026-11-04';

let config;
let environment;
const clients = {};
const expected = {};

async function rulesHash() {
  return createHash('sha256').update(await readFile(RULES_FILE)).digest('hex').toUpperCase();
}

function createClient(name, withAuth = true) {
  const app = initializeApp({
    apiKey: 'demo-api-key',
    projectId: PROJECT_ID,
    databaseURL: DATABASE_URL,
  }, `b1-${name}-${randomUUID()}`);
  let auth = null;
  if (withAuth) {
    auth = initializeAuth(app, { persistence: inMemoryPersistence });
    connectAuthEmulator(auth, `http://${config.emulators.auth.host}:${config.emulators.auth.port}`, {
      disableWarnings: true,
    });
  }
  const db = getDatabase(app, DATABASE_URL);
  connectDatabaseEmulator(db, config.emulators.database.host, config.emulators.database.port);
  return { app, auth, db };
}

function isPermissionDenied(error) {
  return error?.code === 'PERMISSION_DENIED' || /permission[_ ]denied/i.test(error?.message ?? '');
}

async function expectPermissionDenied(promise, label) {
  await assert.rejects(promise, isPermissionDenied, label);
}

async function ensureAccount(client, email) {
  try {
    const credential = await createUserWithEmailAndPassword(client.auth, email, PASSWORD);
    const uid = credential.user.uid;
    await signOut(client.auth);
    return uid;
  } catch (error) {
    if (error?.code !== 'auth/email-already-in-use') throw error;
    const credential = await signInWithEmailAndPassword(client.auth, email, PASSWORD);
    const uid = credential.user.uid;
    await signOut(client.auth);
    return uid;
  }
}

async function login(client, email, expectedUid) {
  const credential = await signInWithEmailAndPassword(client.auth, email, PASSWORD);
  assert.equal(credential.user.uid, expectedUid, `UID inesperado para ${email}.`);
  assert.equal(client.auth.currentUser.uid, expectedUid);
  assert.ok((await credential.user.getIdToken()).length > 0, 'Token de emulador vacío.');
  return credential.user;
}

function driverQuery(db, dni) {
  return get(query(ref(db, '/asignaciones'), orderByChild('choferId'), equalTo(dni)));
}

async function closeClient(client) {
  try {
    if (client.auth?.currentUser) await signOut(client.auth);
  } catch {}
  try {
    await deleteApp(client.app);
  } catch {}
}

before(async () => {
  config = await loadConfiguration();
  await checkEmulators(config);
  assert.equal(await rulesHash(), RULES_SHA256, 'La política candidata no es la esperada.');

  environment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    database: {
      host: config.emulators.database.host,
      port: config.emulators.database.port,
      rules: await readFile(RULES_FILE, 'utf8'),
    },
  });

  clients.admin = createClient('admin');
  clients.driverA = createClient('driver-a');
  clients.driverB = createClient('driver-b');
  clients.student = createClient('student');
  clients.public = createClient('public', false);

  expected.adminUid = await ensureAccount(clients.admin, ADMIN.email);
  expected.driverAUid = await ensureAccount(clients.driverA, DRIVER_A.email);
  expected.studentUid = await ensureAccount(clients.student, STUDENT.email);

  await environment.withSecurityRulesDisabled(async context => {
    await set(ref(context.database(DATABASE_URL), '/'), {
      administradores: {
        [expected.adminUid]: {
          dni: '90000001',
          nombres: 'Admin',
          apellidos: 'B1',
          correo: ADMIN.email,
        },
      },
      choferes: {
        [DRIVER_A.dni]: {
          nombre: 'Conductor',
          apellidos: 'A',
          activo: true,
          uid: expected.driverAUid,
          creadoEn: 1,
          creadoPor: expected.adminUid,
        },
      },
      choferes_uids: {
        [expected.driverAUid]: DRIVER_A.dni,
      },
      buses: {
        [BUS_ID]: { placa: 'B1-001', activo: true },
      },
      ubicacion_buses: {
        [BUS_ID]: { lat: -12.05, lng: -77.05, isActive: true, actualizadoEn: 1 },
      },
    });
  });
});

after(async () => {
  try {
    assert.equal(await rulesHash(), RULES_SHA256, 'La política candidata cambió durante B1.');
  } finally {
    try {
      if (environment) await environment.cleanup();
    } finally {
      for (const client of Object.values(clients)) await closeClient(client);
    }
  }
});

test('B1.1 - Login real con cuentas ficticias de Authentication Emulator', async () => {
  await login(clients.admin, ADMIN.email, expected.adminUid);
  await login(clients.driverA, DRIVER_A.email, expected.driverAUid);
  await login(clients.student, STUDENT.email, expected.studentUid);
  assert.equal(clients.driverB.auth.currentUser, null);
  assert.equal(clients.public.auth, null);
});

test('B1.2 - Conductor A lee su perfil y obtiene una consulta autorizada vacía', async () => {
  assert.equal(clients.driverA.auth.currentUser.uid, expected.driverAUid);
  const profile = await get(ref(clients.driverA.db, `/choferes/${DRIVER_A.dni}`));
  assert.equal(profile.val().uid, expected.driverAUid);
  assert.equal(profile.val().activo, true);

  const assignments = await driverQuery(clients.driverA.db, DRIVER_A.dni);
  assert.equal(assignments.exists(), false);
});

test('B1.3 - Administrador crea conductor B, vínculos y asignaciones', async () => {
  assert.equal(clients.admin.auth.currentUser.uid, expected.adminUid);
  const adminProfile = await get(ref(clients.admin.db, `/administradores/${expected.adminUid}`));
  assert.equal(adminProfile.val().correo, ADMIN.email);

  const driversBefore = await get(ref(clients.admin.db, '/choferes'));
  assert.equal(driversBefore.child(DRIVER_A.dni).exists(), true);
  assert.equal(driversBefore.child(DRIVER_B.dni).exists(), false);

  const assignmentsBefore = await get(ref(clients.admin.db, '/asignaciones'));
  assert.equal(assignmentsBefore.exists(), false);

  const onboarding = createClient('onboarding-b');
  expected.driverBUid = await ensureAccount(onboarding, DRIVER_B.email);
  await closeClient(onboarding);

  await set(ref(clients.admin.db, `/choferes/${DRIVER_B.dni}`), {
    nombre: 'Conductor',
    apellidos: 'B',
    activo: true,
    uid: expected.driverBUid,
    creadoEn: 2,
    creadoPor: expected.adminUid,
  });
  await set(ref(clients.admin.db, `/choferes_uids/${expected.driverBUid}`), DRIVER_B.dni);

  const activeA = push(ref(clients.admin.db, '/asignaciones'));
  await set(activeA, {
    busId: BUS_ID,
    choferId: DRIVER_A.dni,
    fecha: TODAY,
    turno: 'manana',
    activo: true,
    creadoEn: 3,
    creadoPor: expected.adminUid,
  });
  const activeB = push(ref(clients.admin.db, '/asignaciones'));
  await set(activeB, {
    busId: BUS_ID,
    choferId: DRIVER_B.dni,
    fecha: TODAY,
    turno: 'tarde',
    activo: true,
    creadoEn: 4,
    creadoPor: expected.adminUid,
  });
  const cancelled = push(ref(clients.admin.db, '/asignaciones'));
  await set(cancelled, {
    busId: 'BUS-B1-CANCELADO',
    choferId: DRIVER_A.dni,
    fecha: CANCEL_DATE,
    turno: 'noche',
    activo: true,
    creadoEn: 5,
    creadoPor: expected.adminUid,
  });
  await update(cancelled, { activo: false });

  expected.activeAKey = activeA.key;
  expected.activeBKey = activeB.key;
  expected.cancelledKey = cancelled.key;

  const driversAfter = await get(ref(clients.admin.db, '/choferes'));
  assert.equal(driversAfter.child(DRIVER_B.dni).child('uid').val(), expected.driverBUid);
  let links;
  await environment.withSecurityRulesDisabled(async context => {
    const snapshot = await get(ref(context.database(DATABASE_URL), '/choferes_uids'));
    links = snapshot.val();
  });
  assert.equal(links[expected.driverBUid], DRIVER_B.dni);

  const assignmentsAfter = await get(ref(clients.admin.db, '/asignaciones'));
  const data = assignmentsAfter.val();
  assert.equal(data[expected.activeAKey].busId, BUS_ID);
  assert.equal(data[expected.activeAKey].choferId, DRIVER_A.dni);
  assert.equal(data[expected.activeBKey].busId, BUS_ID);
  assert.equal(data[expected.activeBKey].choferId, DRIVER_B.dni);
  assert.equal(data[expected.cancelledKey].activo, false);
  assert.equal(clients.admin.auth.currentUser.uid, expected.adminUid);
});

test('B1.4 - Conductores ejecutan la consulta filtrada exacta de BurritoDriverApp', async () => {
  const aSnapshot = await driverQuery(clients.driverA.db, DRIVER_A.dni);
  const aData = aSnapshot.val() ?? {};
  assert.equal(Object.keys(aData).length, 2);
  assert.equal(aData[expected.activeAKey].choferId, DRIVER_A.dni);
  assert.equal(aData[expected.cancelledKey].activo, false);
  assert.equal(Object.hasOwn(aData, expected.activeBKey), false);

  await login(clients.driverB, DRIVER_B.email, expected.driverBUid);
  const bProfile = await get(ref(clients.driverB.db, `/choferes/${DRIVER_B.dni}`));
  assert.equal(bProfile.val().uid, expected.driverBUid);

  const bSnapshot = await driverQuery(clients.driverB.db, DRIVER_B.dni);
  const bData = bSnapshot.val() ?? {};
  assert.equal(Object.keys(bData).length, 1);
  assert.equal(bData[expected.activeBKey].choferId, DRIVER_B.dni);
  assert.equal(Object.hasOwn(bData, expected.activeAKey), false);
});

test('B1.5 - Estudiante autenticado envía feedback con su UID real', async () => {
  assert.equal(clients.student.auth.currentUser.uid, expected.studentUid);
  const comentarioId = `comentario-b1-${randomUUID()}`;
  await set(ref(clients.student.db, `/comentarios/${comentarioId}`), {
    uid: expected.studentUid,
    rating: 5,
    username: 'Estudiante B1',
    avatar: '',
    email: STUDENT.email,
    mensaje: '',
    timestamp: serverTimestamp(),
  });

  let stored;
  await environment.withSecurityRulesDisabled(async context => {
    const snapshot = await get(ref(context.database(DATABASE_URL), `/comentarios/${comentarioId}`));
    stored = snapshot.val();
  });
  assert.equal(stored.uid, expected.studentUid);
  assert.equal(stored.rating, 5);
  assert.equal(stored.email, STUDENT.email);
  assert.equal(typeof stored.timestamp, 'number');
  assert.ok(stored.timestamp > 0);

  await expectPermissionDenied(
    set(ref(clients.student.db, `/comentarios/${comentarioId}-ajeno`), {
      uid: expected.adminUid,
      rating: 5,
    }),
    'El feedback con UID ajeno debe ser rechazado.',
  );
});

test('B1.6 - Permisos I03/I04 y lectura pública de ubicación se conservan', async () => {
  await expectPermissionDenied(
    get(ref(clients.driverA.db, `/administradores/${expected.adminUid}`)),
    'El conductor no debe leer el nodo administrativo.',
  );
  await expectPermissionDenied(
    get(ref(clients.driverA.db, '/choferes')),
    'El conductor no debe leer el catálogo completo.',
  );
  await expectPermissionDenied(
    get(ref(clients.student.db, '/choferes')),
    'El estudiante no debe leer conductores.',
  );
  await expectPermissionDenied(
    get(ref(clients.student.db, '/asignaciones')),
    'El estudiante no debe leer asignaciones.',
  );

  const publicLocation = await get(ref(clients.public.db, `/ubicacion_buses/${BUS_ID}`));
  assert.equal(publicLocation.val().isActive, true);

  await expectPermissionDenied(
    set(ref(clients.public.db, `/ubicacion_buses/${BUS_ID}`), { lat: -12.1, lng: -77.1 }),
    'La escritura anónima de ubicación debe ser rechazada.',
  );
  await expectPermissionDenied(
    set(ref(clients.student.db, `/ubicacion_buses/${BUS_ID}`), { lat: -12.1, lng: -77.1 }),
    'El estudiante no debe escribir ubicación.',
  );
  await set(ref(clients.driverA.db, `/ubicacion_buses/${BUS_ID}`), {
    lat: -12.06,
    lng: -77.06,
    isActive: true,
    actualizadoEn: 2,
  });
  const updatedLocation = await get(ref(clients.public.db, `/ubicacion_buses/${BUS_ID}`));
  assert.equal(updatedLocation.val().lat, -12.06);
});

test('B1.7 - Logout real invalida la sesión del estudiante', async () => {
  await signOut(clients.student.auth);
  assert.equal(clients.student.auth.currentUser, null);
  await expectPermissionDenied(
    get(ref(clients.student.db, '/choferes')),
    'Sin sesión no debe leer conductores.',
  );
});
