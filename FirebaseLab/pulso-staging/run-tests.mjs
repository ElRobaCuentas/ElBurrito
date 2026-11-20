import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const labRoot = path.dirname(directory);
const projectId = 'demo-pulso-staging-rules';
const host = '127.0.0.1';
const port = 19000;
const ports = [port, 19440, 19450];
const javaHome = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Android', 'Android Studio', 'jbr');
const cliRoot = path.join(process.env.APPDATA, 'npm', 'node_modules', 'firebase-tools');
const cli = path.join(cliRoot, 'lib', 'bin', 'firebase.js');
const emulatorCache = path.join(labRoot, '.cache', 'emulators');
const protectedFiles = ['firebase.json', 'database.rules.json', 'lab.js', 'package.json', 'package-lock.json'];
const digest = async file => createHash('sha256').update(await readFile(file)).digest('hex');

async function main() {
  assert.equal(process.argv.length, 2, 'Este runner solo ejecuta la plantilla local; no acepta destinos ni publicación.');
  assert.ok(projectId.startsWith('demo-'));
  assert.equal(JSON.parse(await readFile(path.join(cliRoot, 'package.json'), 'utf8')).version, '15.20.0');
  await access(path.join(emulatorCache, 'firebase-database-emulator-v4.11.2.jar'));
  const java = spawnSync(path.join(javaHome, 'bin', 'java.exe'), ['-version'], { encoding: 'utf8' });
  assert.equal(java.status, 0, 'No está disponible Java de Android Studio.');
  assert.match(java.stdout + java.stderr, /version "21\./, 'Se requiere Java 21.');
  for (const value of ports) {
    await new Promise((resolve, reject) => {
      const server = createServer();
      server.once('error', () => reject(new Error(`Puerto ${value} ocupado; no se reutilizan emuladores ajenos.`)));
      server.listen({ host, port: value, exclusive: true }, () => server.close(resolve));
    });
  }
  const initialHashes = await Promise.all(protectedFiles.map(file => digest(path.join(labRoot, file))));
  // La configuración generada y los logs pertenecen al scratch, nunca al laboratorio existente.
  const scratch = await mkdtemp(path.join(tmpdir(), 'opencode', 'pulso-staging-rules-'));
  console.log(`Scratch local: ${scratch}`);
  console.log(`Instancia aislada: ${projectId}; RTDB ${host}:${port}; sin Authentication Emulator ni usuarios nuevos.`);
  const configFile = path.join(scratch, 'firebase.json');
  await writeFile(configFile, JSON.stringify({
    database: [{ instance: projectId, rules: path.join(directory, 'database.rules.template.json') }],
    emulators: {
      database: { host, port }, hub: { host, port: 19440 }, logging: { host, port: 19450 },
      ui: { enabled: false }, singleProjectMode: true,
    },
  }, null, 2));
  // No heredar sesiones, tokens, GOOGLE_APPLICATION_CREDENTIALS ni configuración de proyectos reales.
  const env = {
    SystemRoot: process.env.SystemRoot || 'C:\\Windows',
    COMSPEC: process.env.COMSPEC || 'C:\\Windows\\System32\\cmd.exe',
    PATHEXT: process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD',
    PATH: `${path.join(javaHome, 'bin')}${path.delimiter}${process.env.PATH}`,
    HOME: scratch, USERPROFILE: scratch, APPDATA: scratch, LOCALAPPDATA: scratch,
    XDG_CONFIG_HOME: scratch, TEMP: scratch, TMP: scratch, TMPDIR: scratch,
    JAVA_HOME: javaHome, FIREBASE_EMULATORS_PATH: emulatorCache,
    FIREBASE_CLI_DISABLE_MOTD: '1', DO_NOT_TRACK: '1', CI: 'true',
    GCLOUD_PROJECT: projectId, GOOGLE_CLOUD_PROJECT: projectId,
    FIREBASE_DATABASE_EMULATOR_HOST: `${host}:${port}`,
    FIREBASE_EMULATOR_HUB: `${host}:19440`, PULSO_RULES_LOCAL_ONLY: '1',
  };
  const testFile = path.join(directory, 'security.rules.test.js');
  const command = `"${process.execPath}" --test --test-concurrency=1 --test-timeout=15000 "${testFile}"`;
  const child = spawn(process.execPath, [cli, 'emulators:exec', '--project', projectId,
    '--config', configFile, '--only', 'database', '--non-interactive', command], {
    cwd: scratch, env, stdio: 'inherit',
  });
  let timedOut = false;
  const terminate = () => {
    if (child.exitCode === null && child.pid) {
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    }
  };
  const onInterrupt = () => { timedOut = true; terminate(); };
  process.once('SIGINT', onInterrupt);
  const timer = setTimeout(() => { timedOut = true; terminate(); }, 90000);
  try {
    const code = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', resolve);
    });
    assert.equal(timedOut, false, 'Ejecución local interrumpida o agotada.');
    assert.equal(code, 0, 'Las pruebas de reglas no finalizaron correctamente.');
  } finally {
    clearTimeout(timer);
    process.removeListener('SIGINT', onInterrupt);
    terminate();
    const currentHashes = await Promise.all(protectedFiles.map(file => digest(path.join(labRoot, file))));
    assert.deepEqual(currentHashes, initialHashes, 'Se detectaron cambios en archivos existentes de FirebaseLab.');
    console.log('Configuración, reglas y manifiestos originales de FirebaseLab: intactos.');
    console.log(`Scratch conservado para limpieza del proceso padre: ${scratch}`);
  }
}

main().catch(error => {
  console.error(`Verificación local bloqueada: ${error.message}`);
  process.exitCode = 1;
});
