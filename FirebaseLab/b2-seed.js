import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteApp, initializeApp } from 'firebase/app';
import {
  connectAuthEmulator, createUserWithEmailAndPassword, getAuth,
  signInWithEmailAndPassword, signOut,
} from 'firebase/auth';
import { ref, set } from 'firebase/database';
import { DATABASE_URL, HOST, PROJECT_ID, ROOT, checkEmulators, loadConfiguration } from './lab.js';

const RULES_FILE = path.join(ROOT, 'rules', 'i03-i04.rules.json');
const RULES_SHA256 = '0BFAC5C2D900F6900B3E975D6CEFA7A34DBC38DCF6929A4D5C4FD2BA283359C2';
const BUS_ID = 'B2A-101';
const ADMIN = { dni: '90000002', password: 'B2-Admin-2026!', nombres: 'Admin', apellidos: 'B2' };
const DRIVER_A = { dni: '32000001', password: '32000001', nombre: 'Ana', apellidos: 'Quispe' };
const DRIVER_B = { dni: '32000002', password: '32000002', nombre: 'Bruno', apellidos: 'Rojas' };
const ASIGNACION_A = 'b2-semilla-a';

function limaToday() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const get = (type) => parts.find(part => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

async function rulesHash() {
  return createHash('sha256').update(await readFile(RULES_FILE)).digest('hex').toUpperCase();
}

async function ensureAccount(auth, email, password) {
  try {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    const uid = credential.user.uid;
    await signOut(auth);
    return uid;
  } catch (error) {
    if (error?.code !== 'auth/email-already-in-use') throw error;
    const credential = await signInWithEmailAndPassword(auth, email, password);
    const uid = credential.user.uid;
    await signOut(auth);
    return uid;
  }
}

async function verifyRules() {
  const response = await fetch(
    `http://${HOST}:9000/.settings/rules.json?ns=${PROJECT_ID}`,
    { headers: { Authorization: 'Bearer owner' }, signal: AbortSignal.timeout(3000) },
  );
  assert.ok(response.ok, `No se pudieron leer las reglas cargadas (${response.status}).`);
  const loaded = await response.json();
  const expected = JSON.parse(await readFile(RULES_FILE, 'utf8'));
  assert.deepEqual(loaded.rules, expected.rules, 'El emulador no tiene la candidata I03/I04.');
}

const config = await loadConfiguration();
await checkEmulators(config);
assert.equal(await rulesHash(), RULES_SHA256, 'La candidata I03/I04 no es la esperada.');

const environment = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  database: {
    host: config.emulators.database.host,
    port: config.emulators.database.port,
    rules: await readFile(RULES_FILE, 'utf8'),
  },
});

const app = initializeApp({
  apiKey: 'demo-api-key',
  projectId: PROJECT_ID,
  databaseURL: DATABASE_URL,
}, `b2-seed-${randomUUID()}`);
const auth = getAuth(app);
connectAuthEmulator(auth, `http://${config.emulators.auth.host}:${config.emulators.auth.port}`, {
  disableWarnings: true,
});

try {
  const admin = { email: `${ADMIN.dni}@admin.com` };
  const driverA = { email: `${DRIVER_A.dni}@conductor.com` };
  const driverB = { email: `${DRIVER_B.dni}@conductor.com` };
  const adminUid = await ensureAccount(auth, admin.email, ADMIN.password);
  const driverAUid = await ensureAccount(auth, driverA.email, DRIVER_A.password);
  const driverBUid = await ensureAccount(auth, driverB.email, DRIVER_B.password);
  const today = limaToday();
  const now = Date.now();

  await environment.withSecurityRulesDisabled(async context => {
    const database = context.database(DATABASE_URL);
    await set(ref(database, '/'), {
      administradores: {
        [adminUid]: {
          dni: ADMIN.dni,
          nombres: ADMIN.nombres,
          apellidos: ADMIN.apellidos,
          correo: admin.email,
          creadoEn: now,
          creadoPor: null,
        },
      },
      choferes: {
        [DRIVER_A.dni]: {
          nombre: DRIVER_A.nombre,
          apellidos: DRIVER_A.apellidos,
          activo: true,
          uid: driverAUid,
          creadoEn: now,
          creadoPor: adminUid,
        },
        [DRIVER_B.dni]: {
          nombre: DRIVER_B.nombre,
          apellidos: DRIVER_B.apellidos,
          activo: true,
          uid: driverBUid,
          creadoEn: now,
          creadoPor: adminUid,
        },
      },
      choferes_uids: {
        [driverAUid]: DRIVER_A.dni,
        [driverBUid]: DRIVER_B.dni,
      },
      buses: {
        [BUS_ID]: {
          placa: BUS_ID,
          activo: true,
          creadoEn: now,
          creadoPor: adminUid,
        },
      },
      ubicacion_buses: {
        [BUS_ID]: { isActive: false },
      },
      asignaciones: {
        [ASIGNACION_A]: {
          choferId: DRIVER_A.dni,
          busId: BUS_ID,
          fecha: today,
          activo: true,
          turnos: [{ inicio: 420, fin: 540 }],
          horaInicio: 420,
          horaFin: 540,
          createdAt: now,
          createdBy: adminUid,
        },
      },
    });
  });

  await verifyRules();

  console.log(`B2 datos ficticios cargados. Proyecto: ${PROJECT_ID}`);
  console.log(`AdminWeb: http://${HOST}:5173/`);
  console.log(`Admin: DNI ${ADMIN.dni} / contraseña ${ADMIN.password}`);
  console.log(`Conductor A: DNI ${DRIVER_A.dni} / contraseña ${DRIVER_A.password}`);
  console.log(`Conductor B: DNI ${DRIVER_B.dni} / contraseña ${DRIVER_B.password}`);
  console.log(`Bus: ${BUS_ID}; asignación semilla: ${ASIGNACION_A}; fecha: ${today}`);
  console.log('Reglas verificadas: rules/i03-i04.rules.json cargada en RTDB Emulator.');
} finally {
  await deleteApp(app);
}
