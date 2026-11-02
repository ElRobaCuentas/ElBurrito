import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    AppState, PermissionsAndroid, Platform,
    Pressable, StyleSheet, Text, View, ScrollView,
    DeviceEventEmitter, Alert, Linking, ActivityIndicator, useWindowDimensions
} from 'react-native';
// T11: Importamos las nuevas funciones dinámicas y la base de datos
import { updateBusLocation, stopBusService } from '../services/firebase_service';
import database from '@react-native-firebase/database';
import auth from '@react-native-firebase/auth';
import BackgroundJob from 'react-native-background-actions';
import Geolocation from '@react-native-community/geolocation';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { COLORS } from '../shared/theme/colors';
import { TYPOGRAPHY } from '../shared/theme/typography';
import { pause, withTimeout } from '../shared/utils/timeout';
import crashlytics from '@react-native-firebase/crashlytics';

interface Props {
    driverDni: string;
}

const sendLog = (text: string, type: 'info' | 'error' | 'success' | 'warning' = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    DeviceEventEmitter.emit('PRO_DEBUG_LOG', {
        id: Math.random(),
        t: `[${timestamp}] ${text}`,
        type
    });
};

// C3: Constantes del watchdog de reinicio automático
const PULSE_TIMEOUT_MS = 30000;
const WATCHDOG_INTERVAL_MS = 10000;

// T4.1: Heartbeat de presencia. Cuando el GPS no emite (bus quieto, sin
// superar distanceFilter), el heartbeat mantiene fresco el timestamp en RTDB
// escribiendo la última posición conocida. Menor que PULSE_TIMEOUT_MS para
// que el watchdog no interprete el bus estacionado como servicio muerto.
const HEARTBEAT_INTERVAL_MS = 8000;

// C4.3: Timeout y reintentos al cargar la asignación.
// El timeout cubre el intento COMPLETO (lectura de chofer + lectura de asignación).
const ASSIGNMENT_TIMEOUT_MS = 10000;
const ASSIGNMENT_RETRIES = 2;
const ASSIGNMENT_RETRY_PAUSE_MS = 1500;

// I08: solo selección diaria; no controla la continuidad del recorrido activo.
const getLimaDate = () => {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date());
    const part = (type: string) => parts.find(value => value.type === type)!.value;
    return `${part('year')}-${part('month')}-${part('day')}`;
};

interface DailyAssignment {
    driverDni: string;
    date: string;
    busId: string;
    assignmentId: string;
}

const queryDailyAssignment = async (driverDni: string) => {
    const snapshot = await database().ref('/asignaciones')
        .orderByChild('choferId').equalTo(driverDni).once('value');
    // La respuesta puede atravesar medianoche: seleccionar con la fecha al resolver.
    const date = getLimaDate();
    const candidates: DailyAssignment[] = [];
    let invalid = false;
    if (snapshot.exists()) {
        snapshot.forEach(child => {
            const value = child.val();
            if (!value || typeof value.fecha !== 'string') {
                invalid = true;
                return undefined;
            }
            if (value.fecha !== date) return undefined;
            // equalTo limita el conductor; tampoco aceptar una contradicción explícita.
            if ((value.choferId !== undefined && value.choferId !== driverDni) ||
                typeof value.activo !== 'boolean') {
                invalid = true;
                return undefined;
            }
            if (!value.activo) return undefined;
            if (!child.key || typeof value.busId !== 'string' || !value.busId.trim() ||
                [...value.busId as string].some(character =>
                    '.#$[]/'.includes(character) || character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) {
                invalid = true;
                return undefined;
            }
            candidates.push({driverDni, date, busId: value.busId, assignmentId: child.key});
            return undefined;
        });
    }
    const problem = invalid ? 'La asignación contiene datos inválidos. Contacta a la oficina.' :
        candidates.length > 1 ? 'Hay asignaciones contradictorias para hoy. Contacta a la oficina.' :
        candidates.length === 0 ? 'No tienes un bus asignado para hoy. Contacta a la oficina.' : null;
    return {assignment: problem ? null : candidates[0], problem};
};

// I07: autoridad del recorrido compartida entre montajes, no recursos del GPS.
const trackingIntent = {
    generation: 0,
    shouldRun: false,
    starting: null as number | null,
    restarting: null as number | null,
    stopping: null as number | null,
    stopFailed: false,
    sending: false,
    recoveryFailed: false,
    // I08: identidad fijada al validar INICIAR; independiente de la próxima asignación.
    run: null as Pick<DailyAssignment, 'driverDni' | 'busId'> | null,
};
// Notifica solo a las pantallas montadas; las operaciones no retienen sus setters.
const publishTrackingState = () => DeviceEventEmitter.emit('PRO_TRACKING_STATE');
const isCurrentRun = (generation: number) =>
    trackingIntent.shouldRun && trackingIntent.generation === generation;

interface LocationExecution {
    id: number;
    generation: number;
    cancelled: boolean;
    started: boolean;
    dispose?: () => void;
}
let nextLocationExecution = 0;
let currentLocationExecution: LocationExecution | null = null;
const disposeLocationExecution = (execution = currentLocationExecution) => {
    if (!execution) return;
    execution.cancelled = true;
    execution.dispose?.();
    if (currentLocationExecution === execution) currentLocationExecution = null;
};

// Solo serializa llamadas al servicio; nunca espera escrituras Firebase.
let backgroundTransition: Promise<void> = Promise.resolve();
const runBackgroundTransition = <T,>(operation: () => Promise<T>): Promise<T> => {
    const result = backgroundTransition.then(operation);
    backgroundTransition = result.then(() => undefined, () => undefined);
    return result;
};

const locationTask = async (taskDataArguments: any) => {
    // T11: Rescatamos también el busId inyectado
    const { busId, executionId } = taskDataArguments;

    // El wrapper termina su envoltura con BackgroundJob.stop(). Resolver aquí
    // al limpiar dispararía otro stop global que podría alcanzar al sucesor.
    return new Promise<void>(() => {
        const execution = currentLocationExecution;
        if (!execution || execution.id !== executionId || execution.cancelled ||
            execution.dispose || !isCurrentRun(execution.generation)) return;
        const isActive = () => !execution.cancelled &&
            currentLocationExecution === execution && isCurrentRun(execution.generation);
        let watchId: number | undefined;
        let heartbeat: ReturnType<typeof setInterval> | undefined;
        let keepAlive: ReturnType<typeof setInterval> | undefined;
        let disposed = false;

        // T4.1: Última posición conocida y último intento de escritura a RTDB.
        // lastWriteAt se fija al INTENTAR escribir (antes del await) y se
        // resetea en fallo, para que el heartbeat no descarte fuegos ni
        // duplique escrituras cuando el GPS ya emitió hace poco.
        let lastLocation: { latitude: number; longitude: number; heading: number; speed: number } | null = null;
        let lastWriteAt = 0;

        execution.dispose = () => {
            if (disposed) return;
            disposed = true;
            execution.cancelled = true;
            if (heartbeat !== undefined) clearInterval(heartbeat);
            if (keepAlive !== undefined) clearInterval(keepAlive);
            lastLocation = null;
            if (currentLocationExecution === execution) currentLocationExecution = null;
            if (watchId !== undefined) {
                const id = watchId;
                watchId = undefined;
                try {
                    Geolocation.clearWatch(id);
                } catch (err: any) {
                    sendLog(`❌ Error liberando observador GPS: ${err.message}`, "error");
                }
            }
            sendLog("Limpieza local de recursos GPS procesada", "info");
        };
        sendLog("Preparando seguimiento GPS", "info");

        // T4.1: Única ruta de escritura a RTDB. Tanto el callback del GPS como
        // el heartbeat pasan por aquí para no divergir (una sola
        // responsabilidad de escribir en Firebase).
        const writeLocation = async (coords: { latitude: number; longitude: number; heading: number; speed: number }) => {
            if (!isActive()) return false;
            try {
                // T4.1: lastWriteAt se fija ANTES del await (instante del intento).
                // Antes se fijaba tras el éxito: el siguiente fuego del heartbeat
                // (~8004 ms después) quedaba por debajo de HEARTBEAT_INTERVAL_MS y
                // se descartaba → patrón real escribir → saltar → escribir (≈16 s).
                lastWriteAt = Date.now();
                // T11: Usamos updateBusLocation con la placa dinámica
                const ok = await updateBusLocation(busId, {
                    ...coords,
                    timestamp: Date.now(),
                });
                if (!isActive()) return false;
                if (!ok) {
                    sendLog("❌ FALLO FIREBASE: no se pudo actualizar la ubicación", "error");
                    return false;
                }
                return true;
            } catch (err: any) {
                if (!isActive()) return false;
                // T4.1: El intento fallido no cuenta como escritura reciente:
                // se resetea para que el próximo fuego del heartbeat reintente
                // (≈8 s), sin cola ni escrituras duplicadas.
                lastWriteAt = 0;
                sendLog(`❌ FALLO FIREBASE: ${err.message}`, "error");
                return false;
            }
        };

        watchId = Geolocation.watchPosition(
            async (position) => {
                if (!isActive()) return;
                const { latitude, longitude, heading, speed } = position.coords;
                const coords = {
                    latitude,
                    longitude,
                    heading: heading ?? 0,
                    speed: speed ?? 0,
                };
                lastLocation = coords;
                // C3: Pulso de vida hacia la UI (mismo canal que el debug panel)
                DeviceEventEmitter.emit('PRO_LOCATION_PULSE', { ts: Date.now() });
                sendLog(`GPS recibido: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`, "info");

                sendLog("Publicación de ubicación solicitada");
                const ok = await writeLocation(coords);
                if (ok && isActive()) {
                    sendLog("Publicación de ubicación confirmada", "success");
                }
            },
            (err) => {
                if (!isActive()) return;
                sendLog(`❌ FALLO GPS: ${err.message}`, "error");
            },
            {
                enableHighAccuracy: true,
                distanceFilter: 2, 
                interval: 3000,    
                fastestInterval: 2000, 
            }
        );

        // T4.1: Heartbeat de presencia. Mantiene fresco el timestamp en RTDB
        // cuando el GPS no emite (bus quieto, sin superar distanceFilter).
        // Escribe la última posición conocida solo si no hubo otra escritura
        // reciente, para no duplicar el trabajo del GPS.
        heartbeat = setInterval(() => {
            if (!isActive()) return;
            if (!lastLocation) {
                return;
            }
            if (Date.now() - lastWriteAt < HEARTBEAT_INTERVAL_MS) {
                return;
            }
            // C3: El pulso también vale como señal de vida hacia la UI,
            // aunque la escritura falle (sin red, por ejemplo).
            DeviceEventEmitter.emit('PRO_LOCATION_PULSE', { ts: Date.now() });
            sendLog(`HEARTBEAT: ${lastLocation.latitude.toFixed(5)}, ${lastLocation.longitude.toFixed(5)}`, "info");
            writeLocation(lastLocation);
        }, HEARTBEAT_INTERVAL_MS);

        keepAlive = setInterval(() => {
            // El wrapper no fija isRunning hasta confirmar el inicio nativo.
            if (!isActive() || (execution.started && !BackgroundJob.isRunning())) {
                execution.dispose?.();
            }
        }, 1000);
    });
};

// T11: Agregamos busId a las opciones
const getBackgroundOptions = (uid: string, busId: string, executionId: number) => ({
    taskName: 'BurritoTracker',
    taskTitle: `El Bus ${busId} está en ruta`,
    taskDesc: 'Transmitiendo ubicación...',
    taskIcon: { name: 'ic_launcher', type: 'mipmap' },
    color: '#2060cd',
    parameters: { uidChofer: uid, busId, executionId },
    ongoing: true,
    foregroundServiceType: ['location' as const],
});

const requestAllPermissions = async (): Promise<boolean> => {
    if (Platform.OS === 'android' && Platform.Version >= 33) {
        sendLog("Solicitando permiso de notificaciones");
        const notifGranted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
        if (notifGranted !== PermissionsAndroid.RESULTS.GRANTED) {
            sendLog("❌ NOTIFICACIONES DENEGADAS", "error");
            Alert.alert("Permiso crítico denegado", "Sin notificaciones, el rastreo se detiene en segundo plano.", [
                { text: "Cancelar", style: "cancel" },
                { text: "Abrir Ajustes", onPress: () => Linking.openSettings() }
            ]);
            return false;
        }
    }
    const fineGranted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    if (fineGranted !== PermissionsAndroid.RESULTS.GRANTED) {
        sendLog("❌ PERMISO GPS DENEGADO", "error");
        return false;
    }
    const bgGranted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION);
    if (bgGranted !== PermissionsAndroid.RESULTS.GRANTED) {
        sendLog("❌ PERMISO SEGUNDO PLANO DENEGADO", "error");
        return false;
    }
    return true;
};

export const SendCoordinates = ({ driverDni }: Props) => {
    const [isSending, setIsSending] = useState(trackingIntent.sending);
    const [isStarting, setIsStarting] = useState(trackingIntent.starting !== null || trackingIntent.restarting !== null);
    const [isStopping, setIsStopping] = useState(trackingIntent.stopping !== null);
    const [stopFailed, setStopFailed] = useState(trackingIntent.stopFailed);
    const [logs, setLogs] = useState<any[]>([]);
    const [pausedLogs, setPausedLogs] = useState<any[] | null>(null);
    
    // C3: Estado del watchdog de reinicio automático
    const lastPulseRef = useRef(0);
    const [recoveryFailed, setRecoveryFailed] = useState(trackingIntent.recoveryFailed);
    
    // T11: Nuevos estados para la auto-asignación
    const [busId, setBusId] = useState<string | null>(null);
    const [asignacionId, setAsignacionId] = useState<string | null>(null);
    const [loadingAssignment, setLoadingAssignment] = useState(true);
    const [driverName, setDriverName] = useState<string | null>(null);

    // C4.3: Estados y guards de la carga de asignación
    const [assignmentError, setAssignmentError] = useState(false);
    const [retrying, setRetrying] = useState(false);
    const fetchGenRef = useRef(0);
    const isLoadingAssignmentRef = useRef(false);
    // Respaldo B, solo en memoria de esta pantalla y para el mismo conductor/día.
    const validatedAssignmentRef = useRef<DailyAssignment | null>(null);
    const assignmentDriverRef = useRef(driverDni);
    assignmentDriverRef.current = driverDni;

    const [showDebug, setShowDebug] = useState(false);
    const { width: viewportWidth, fontScale } = useWindowDimensions();
    const stackInfoRows = viewportWidth < 360 || fontScale > 1.25;

    // C4.3: Carga de la asignación con timeout por intento completo y reintento acotado.
    // Cada i ntento corre dentro de ASSIGNMENT_TIMEOUT_MS y cubre ambas lecturas de Firebase
    // (chofer + asignación) con un solo reloj. El guard de generación (fetchGenRef) ignora
    // respuestas tardías de un intento vencido para que no sobrescriban un ciclo más nuevo
    // (Promise.race no cancela la consulta, solo deja de esperarla).
    const loadAssignment = useCallback(async () => {
        if (isLoadingAssignmentRef.current) return;
        isLoadingAssignmentRef.current = true;
        const gen = ++fetchGenRef.current;
        setLoadingAssignment(true);
        setAssignmentError(false);
        setRetrying(false);
        try {
            for (let intento = 1; intento <= ASSIGNMENT_RETRIES; intento++) {
                if (gen !== fetchGenRef.current) return;
                if (intento > 1) {
                    setRetrying(true);
                    sendLog(`⚠️ Reintentando la carga de asignación (${intento}/${ASSIGNMENT_RETRIES})...`, "warning");
                    await pause(ASSIGNMENT_RETRY_PAUSE_MS);
                    if (gen !== fetchGenRef.current) return;
                }
                try {
                    const r = await withTimeout((async () => {
                        let name: string | null = null;
                        try {
                            const choferSnapshot = await database().ref(`/choferes/${driverDni}`).once('value');
                            if (choferSnapshot.exists()) {
                                const chofer = choferSnapshot.val();
                                name = `${chofer.nombre} ${chofer.apellidos}`.trim();
                            }
                        } catch (e: any) {
                            // El nombre es opcional: su fallo no debe tumbar el intento.
                            // Se loguea solo si este intento sigue siendo el actual.
                            if (gen === fetchGenRef.current) {
                                sendLog(`❌ Error consultando nombre del conductor: ${e.message}`, "error");
                            }
                        }

                        const result = await queryDailyAssignment(driverDni);
                        return { name, ...result };
                    })(), ASSIGNMENT_TIMEOUT_MS);

                    if (gen !== fetchGenRef.current || assignmentDriverRef.current !== driverDni) return;
                    // Resultado aplicado solo si seguimos siendo la generación actual
                    setDriverName(r.name);
                    if (r.name) {
                        sendLog("Conductor identificado", "success");
                    } else {
                        sendLog("Perfil del conductor no disponible", "error");
                    }
                    validatedAssignmentRef.current = r.assignment;
                    setBusId(r.assignment?.busId ?? null);
                    setAsignacionId(r.assignment?.assignmentId ?? null);
                    if (r.assignment) {
                        sendLog(`Bus asignado: ${r.assignment.busId} (datos disponibles del SDK; no certifica actualización remota)`, "success");
                    } else {
                        // Resultado válido: Firebase respondió y no hay asignación. No se reintenta.
                        sendLog(`❌ ${r.problem}`, "error");
                    }
                    setLoadingAssignment(false);
                    return;
                } catch (e: any) {
                    if (gen !== fetchGenRef.current) return;
                    sendLog(`❌ Intento ${intento}/${ASSIGNMENT_RETRIES} falló: ${e.message}`, "error");
                }
            }
            if (gen !== fetchGenRef.current) return;
            // Se agotaron los reintentos: salir del spinner y mostrar la tarjeta de error
            setLoadingAssignment(false);
            setAssignmentError(true);
        } finally {
            // Regla del equipo: liberar el guard en TODOS los caminos (éxito, timeout,
            // error, retorno temprano). Si quedara en true, REINTENTAR dejaría de funcionar.
            isLoadingAssignmentRef.current = false;
        }
    }, [driverDni]);

    useEffect(() => {
        const logSubscription = DeviceEventEmitter.addListener('PRO_DEBUG_LOG', (newLog) => {
            setLogs(prev => [...prev, newLog].slice(-30));
        });

        // C3: La UI escucha el pulso del motor para conocer la última posición enviada
        const pulseSubscription = DeviceEventEmitter.addListener('PRO_LOCATION_PULSE', (payload: { ts: number }) => {
            lastPulseRef.current = payload.ts;
        });
        const syncTrackingState = () => {
            setIsSending(trackingIntent.sending);
            setIsStarting(trackingIntent.starting !== null || trackingIntent.restarting !== null);
            setIsStopping(trackingIntent.stopping !== null);
            setStopFailed(trackingIntent.stopFailed);
            setRecoveryFailed(trackingIntent.recoveryFailed);
            // Un inicio que termina tras remontar también inicializa el reloj
            // del watchdog de la pantalla nueva, no el ref del componente viejo.
            if (trackingIntent.sending && trackingIntent.shouldRun) lastPulseRef.current = Date.now();
        };
        const trackingSubscription = DeviceEventEmitter.addListener('PRO_TRACKING_STATE', syncTrackingState);
        syncTrackingState();

        const appStateSub = AppState.addEventListener('change', (state) => {
            sendLog(state === 'active' ? 'App en primer plano' :
                state === 'background' ? 'App en segundo plano' :
                state === 'inactive' ? 'App inactiva' : `Estado de la app: ${state}`);
        });

        // C4.7: Al re-montar, si el servicio sigue activo se restaura el estado visual.
        // Va después de los listeners (para que sendLog funcione) y antes de
        // loadAssignment() porque únicamente restaura el estado del motor: no depende
        // de Firebase ni modifica la asignación. isRunning() conserva true cuando el
        // proceso y el singleton JS sobrevivieron al cierre de la app.
        if (trackingIntent.shouldRun && trackingIntent.sending &&
            trackingIntent.starting === null && trackingIntent.restarting === null && BackgroundJob.isRunning()) {
            setLogs([]);
            lastPulseRef.current = Date.now();
            sendLog("Recorrido restaurado: el servicio seguía activo en segundo plano", "success");
        }

        // C4.3: Carga de la asignación con timeout y reintento acotado (ver loadAssignment)
        loadAssignment();

        return () => {
            logSubscription.remove();
            pulseSubscription.remove();
            trackingSubscription.remove();
            appStateSub.remove();
        };
    }, [driverDni, loadAssignment]);

    // C3: Arranca el BackgroundJob (usado por INICIAR y por el reinicio automático)
    const startBackgroundJob = useCallback(async (generation: number) => {
        const run = trackingIntent.run;
        if (!run || !isCurrentRun(generation)) return false;
        return runBackgroundTransition(async () => {
            if (!isCurrentRun(generation)) return false;
            disposeLocationExecution();
            const execution: LocationExecution = {
                id: ++nextLocationExecution, generation, cancelled: false, started: false,
            };
            currentLocationExecution = execution;
            lastPulseRef.current = Date.now();
            // T11: Inyectamos el driverDni y el busId al servicio
            const options = getBackgroundOptions(run.driverDni, run.busId, execution.id);
            try {
                await BackgroundJob.start(locationTask, options);
            } catch (error) {
                disposeLocationExecution(execution);
                throw error;
            }
            // DETENER ya dejó su stop detrás de este start en la misma exclusión.
            if (!isCurrentRun(generation)) {
                disposeLocationExecution(execution);
                return false;
            }
            execution.started = true;
            trackingIntent.sending = true;
            trackingIntent.recoveryFailed = false;
            publishTrackingState();
            sendLog(`Servicio Android iniciado · bus ${run.busId}`, "success");
            return true;
        });
    }, []);

    // C3: Detecta que el motor se detuvo en silencio y lo reinicia
    const restartBackgroundJob = useCallback(async (generation: number) => {
        if (!isCurrentRun(generation) || trackingIntent.starting !== null ||
            trackingIntent.restarting !== null || trackingIntent.stopping !== null) return;
        trackingIntent.restarting = generation;
        publishTrackingState();
        sendLog("⚠️ Motor sin pulsos: intentando reiniciar el servicio...", "warning");
        try {
            await runBackgroundTransition(async () => {
                if (!isCurrentRun(generation)) return;
                disposeLocationExecution();
                try {
                    await BackgroundJob.stop();
                } catch (e: any) {
                    if (isCurrentRun(generation)) {
                        sendLog(`❌ Error deteniendo servicio previo: ${e.message}`, "error");
                    }
                }
            });
            if (!isCurrentRun(generation)) return;
            const started = await startBackgroundJob(generation);
            if (started && isCurrentRun(generation)) {
                sendLog("Servicio Android reiniciado", "success");
            }
        } catch (e: any) {
            if (!isCurrentRun(generation)) return;
            trackingIntent.shouldRun = false;
            trackingIntent.sending = false;
            trackingIntent.recoveryFailed = true;
            publishTrackingState();
            sendLog(`❌ NO SE PUDO REINICIAR: ${e.message}`, "error");
            crashlytics().recordError(e, 'restartBackgroundJob');
            Alert.alert(
                "Tracking detenido",
                "El envío de ubicación se detuvo y no pudo recuperarse automáticamente. Presiona INICIAR para reintentar."
            );
        } finally {
            if (trackingIntent.restarting === generation) {
                trackingIntent.restarting = null;
                publishTrackingState();
            }
        }
    }, [startBackgroundJob]);

    // C3: Watchdog que vigila los pulsos del motor mientras el recorrido está activo
    useEffect(() => {
        if (!isSending) return;
        const generation = trackingIntent.generation;
        const watchdog = setInterval(() => {
            if (!isCurrentRun(generation) || trackingIntent.starting !== null ||
                trackingIntent.restarting !== null || trackingIntent.stopping !== null) return;
            if (Date.now() - lastPulseRef.current > PULSE_TIMEOUT_MS) {
                restartBackgroundJob(generation);
            }
        }, WATCHDOG_INTERVAL_MS);
        return () => clearInterval(watchdog);
    }, [isSending, restartBackgroundJob]);

    const startProcess = async () => {
        if (trackingIntent.starting !== null || trackingIntent.restarting !== null ||
            trackingIntent.stopping !== null || trackingIntent.stopFailed || BackgroundJob.isRunning()) return;

        const generation = ++trackingIntent.generation;
        trackingIntent.shouldRun = true;
        trackingIntent.starting = generation;
        publishTrackingState();

        setLogs([]);
        sendLog("Inicio solicitado", "info");

        try {
            const permisosOk = await requestAllPermissions();
            if (!isCurrentRun(generation)) return;
            if (!permisosOk) {
                trackingIntent.shouldRun = false;
                return;
            }

            let assignment: DailyAssignment | null = null;
            try {
                const result = await withTimeout(queryDailyAssignment(driverDni), ASSIGNMENT_TIMEOUT_MS);
                if (!isCurrentRun(generation) || assignmentDriverRef.current !== driverDni) return;
                // Una cancelación, ausencia, conflicto o dato inválido conocido revoca el respaldo.
                validatedAssignmentRef.current = result.assignment;
                assignment = result.assignment;
                setBusId(assignment?.busId ?? null);
                setAsignacionId(assignment?.assignmentId ?? null);
                if (!assignment) {
                    trackingIntent.shouldRun = false;
                    Alert.alert('Bloqueo', result.problem!);
                    return;
                }
                sendLog('Asignación comprobada con datos disponibles del SDK; no garantiza confirmación remota reciente.');
            } catch (error: any) {
                if (!isCurrentRun(generation) || assignmentDriverRef.current !== driverDni) return;
                const denied = /permission[-_]denied|unauth/i.test(`${error.code ?? ''} ${error.message ?? ''}`);
                if (denied) validatedAssignmentRef.current = null;
                // Un timeout solo NO habilita el inicio: exigir desconexión conocida y respaldo vigente.
                let offline = false;
                if (!denied) {
                    try {
                        const connection = await withTimeout(
                            database().ref('.info/connected').once('value'), ASSIGNMENT_TIMEOUT_MS,
                        );
                        offline = connection.val() === false;
                    } catch { /* Estado desconocido: no autoriza respaldo. */ }
                }
                if (!isCurrentRun(generation) || assignmentDriverRef.current !== driverDni) return;
                const saved = validatedAssignmentRef.current;
                if (offline && saved?.driverDni === driverDni && saved.date === getLimaDate()) {
                    assignment = saved;
                    sendLog('⚠️ Inicio sin conexión: asignación conservada del mismo conductor y día. Puede haber cancelaciones remotas aún no recibidas.', 'warning');
                } else {
                    trackingIntent.shouldRun = false;
                    Alert.alert('No se pudo validar la asignación', 'No hay una asignación válida disponible para iniciar. Conéctate y vuelve a intentarlo.');
                    return;
                }
            }
            if (!isCurrentRun(generation)) return;
            if (assignment.date !== getLimaDate()) {
                validatedAssignmentRef.current = null;
                trackingIntent.shouldRun = false;
                Alert.alert('Cambió el día', 'Vuelve a presionar INICIAR para validar la asignación del nuevo día.');
                return;
            }
            trackingIntent.run = {driverDni: assignment.driverDni, busId: assignment.busId};
            sendLog("Iniciando servicio Android");
            await startBackgroundJob(generation);
        } catch (e: any) {
            if (!isCurrentRun(generation)) return;
            trackingIntent.shouldRun = false;
            sendLog(`❌ Error al iniciar: ${e.message}`, "error");
            crashlytics().recordError(e, 'startProcess');
        } finally {
            if (trackingIntent.starting === generation) {
                trackingIntent.starting = null;
                publishTrackingState();
            }
        }
    };

    const handleLogout = () => {
        Alert.alert(
            'Cerrar sesión',
            '¿Está seguro de que desea cerrar sesión?',
            [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Sí, cerrar sesión', style: 'destructive', onPress: () => auth().signOut() },
            ]
        );
    };

    const stopProcess = async () => {
        if (trackingIntent.stopping !== null) return;
        // Una pulsación ya atendida no vuelve a emitir la parada remota pendiente.
        if (!trackingIntent.shouldRun && !trackingIntent.stopFailed && !BackgroundJob.isRunning()) return;
        // Capturar antes del primer await; el estado de la pantalla no decide qué bus detener.
        const run = trackingIntent.run;
        // Prioridad de DETENER: invalida antes del primer await, incluso permisos.
        const generation = ++trackingIntent.generation;
        trackingIntent.shouldRun = false;
        trackingIntent.starting = null;
        trackingIntent.restarting = null;
        trackingIntent.stopping = generation;
        publishTrackingState();
        sendLog("Deteniendo proceso...");
        disposeLocationExecution();
        try {
            try {
                await runBackgroundTransition(() => BackgroundJob.stop());
            } catch (e: any) {
                trackingIntent.stopFailed = true;
                publishTrackingState();
                sendLog(`❌ PARADA LOCAL NO CONFIRMADA: ${e.message}. Reintenta DETENER.`, "error");
                return;
            }
            if (run) {
                const label = `operación ${generation}, bus ${run.busId}`;
                const reportRemote = (ok: boolean, error?: unknown) => {
                    const previous = trackingIntent.generation !== generation ? ' — operación anterior' : '';
                    sendLog(
                        `${ok ? '✅ PARADA REMOTA CONFIRMADA' : '❌ PARADA REMOTA FALLIDA'} (${label})${previous}${error ? `: ${String(error)}` : ''}`,
                        ok ? 'success' : 'error'
                    );
                };
                sendLog(`PARADA REMOTA PENDIENTE (${label}): solicitando isActive:false`);
                try {
                    // Se invoca antes de liberar INICIAR. La confirmación no
                    // participa del cierre local ni vuelve a escribir al terminar.
                    stopBusService(run.busId).then(
                        ok => reportRemote(ok),
                        error => reportRemote(false, error)
                    );
                } catch (error) {
                    reportRemote(false, error);
                }
            }
            // Solo la parada local confirmada libera la identidad; el ACK remoto no la modifica.
            trackingIntent.run = null;
            trackingIntent.stopFailed = false;
            trackingIntent.sending = false;
            publishTrackingState();
            sendLog("PARADA LOCAL COMPLETADA", "success");
        } finally {
            if (trackingIntent.stopping === generation) {
                trackingIntent.stopping = null;
                publishTrackingState();
            }
        }
    };

    const hasTrackingControls = isSending || isStarting || isStopping || stopFailed;
    const trackingActive = isSending && !isStarting && !isStopping && !stopFailed;
    const showStopFailure = stopFailed && !isStopping;
    const displayedBusId = hasTrackingControls && trackingIntent.run ? trackingIntent.run.busId : busId;

    return (
        <View style={styles.container}>
            <ScrollView
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
            >
                {loadingAssignment && !hasTrackingControls ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color={COLORS.primary} />
                        <Text style={styles.loadingText}>
                            {retrying ? 'Problemas de conexión. Reintentando…' : 'Cargando asignación...'}
                        </Text>
                    </View>
                ) : assignmentError && !hasTrackingControls ? (
                    // C4.3: Se agotaron los reintentos — tarjeta visible, nunca atrapar al conductor.
                    // CERRAR SESIÓN siempre accesible. REINTENTAR dispara un nuevo ciclo de 2 intentos.
                    <View style={styles.errorCard}>
                        <Text style={styles.errorTitle}>No se pudo cargar tu asignación</Text>
                        <Text style={styles.errorSubtitle}>
                            Verifica tu conexión a Internet e inténtalo nuevamente.
                        </Text>
                        <Pressable
                            onPress={loadAssignment}
                            style={styles.btnStart}
                        >
                            <Text style={[styles.btnText, styles.btnTextStart]}>REINTENTAR</Text>
                        </Pressable>
                        <Pressable
                            onPress={handleLogout}
                            style={styles.btnLogout}
                            accessibilityLabel="CERRAR SESIÓN"
                        >
                            <MaterialCommunityIcons name="logout" size={20} color="#4A5568" style={styles.btnIcon} accessible={false} />
                            <Text style={styles.btnLogoutText}>CERRAR SESIÓN</Text>
                        </Pressable>
                    </View>
                ) : (
                    <>
                        <View style={[styles.statusSection, showStopFailure && styles.statusSectionError]}>
                            <View style={[styles.statusDot, showStopFailure ? styles.statusDotError : trackingActive ? styles.statusDotActive : styles.statusDotInactive]} />
                            <Text style={[styles.statusText, showStopFailure ? styles.statusTextError : trackingActive ? styles.statusTextActive : styles.statusTextInactive]}>
                                {isStopping ? 'Deteniendo…' : stopFailed ? 'No se pudo completar la detención' : isStarting ? 'Iniciando…' : isSending ? 'Servicio de ubicación activo' : 'Detenido'}
                            </Text>
                        </View>

                        <View style={styles.infoCard}>
                            <View style={styles.cardHeader}>
                                <Text style={styles.cardTitle}>Información del viaje</Text>
                            </View>
                            <View style={[styles.infoRow, stackInfoRows && styles.infoRowStacked]}>
                                <Text style={[styles.infoLabel, stackInfoRows && styles.infoLabelStacked]}>Conductor asignado</Text>
                                <Text style={[styles.infoValue, stackInfoRows && styles.infoValueStacked]}>{driverName || driverDni}</Text>
                            </View>
                            <View style={styles.divider} />
                            <View style={[styles.infoRow, stackInfoRows && styles.infoRowStacked]}>
                                <Text style={[styles.infoLabel, stackInfoRows && styles.infoLabelStacked]}>Vehículo asignado</Text>
                                <Text style={[styles.infoValue, stackInfoRows && styles.infoValueStacked, !displayedBusId && styles.infoValueMuted]}>
                                    {displayedBusId || 'Sin asignación'}
                                </Text>
                            </View>
                        </View>

                        {!displayedBusId && !isSending && (
                            <Text style={styles.errorText}>
                                No tienes un bus asignado para hoy. Contacta a la oficina.
                            </Text>
                        )}

                        {recoveryFailed && (
                            <Text style={styles.errorText}>
                                El envío de ubicación se detuvo y no pudo recuperarse automáticamente. Presiona INICIAR para reintentar.
                            </Text>
                        )}

                        {hasTrackingControls ? (
                            <Pressable
                                onPress={stopProcess}
                                style={styles.btnStop}
                                accessibilityLabel="DETENER RECORRIDO"
                            >
                                <MaterialCommunityIcons name="stop" size={20} color={COLORS.white} style={styles.btnIcon} accessible={false} />
                                <Text style={styles.btnText}>DETENER RECORRIDO</Text>
                            </Pressable>
                        ) : (
                            <>
                                <Pressable
                                    onPress={startProcess}
                                    style={styles.btnStart}
                                    accessibilityLabel="INICIAR RECORRIDO"
                                >
                                    <MaterialCommunityIcons name="play" size={20} color="#06283D" style={styles.btnIcon} accessible={false} />
                                    <Text style={[styles.btnText, styles.btnTextStart]}>INICIAR RECORRIDO</Text>
                                </Pressable>

                                <Pressable
                                    onPress={handleLogout}
                                    style={styles.btnLogout}
                                    accessibilityLabel="CERRAR SESIÓN"
                                >
                                    <MaterialCommunityIcons name="logout" size={20} color="#4A5568" style={styles.btnIcon} accessible={false} />
                                    <Text style={styles.btnLogoutText}>CERRAR SESIÓN</Text>
                                </Pressable>
                            </>
                        )}

                        <View style={styles.debugSection}>
                            <View style={styles.debugCard}>
                                <View style={styles.debugCardHeader}>
                                    <View style={styles.debugTitleRow}>
                                        <MaterialCommunityIcons name="clipboard-text-outline" size={18} color="#4A5568" style={styles.btnIcon} accessible={false} />
                                        <Text style={styles.debugTitle}>Diagnóstico técnico</Text>
                                    </View>
                                    <Text style={styles.debugSubtitle}>
                                        Información utilizada durante la fase de validación del sistema.
                                    </Text>
                                </View>

                                <Pressable
                                    accessibilityRole="button"
                                    accessibilityLabel={showDebug ? 'Ocultar diagnóstico técnico' : 'Mostrar diagnóstico técnico'}
                                    accessibilityState={{expanded: showDebug}}
                                    onPress={() => {
                                        if (showDebug) setPausedLogs(null);
                                        setShowDebug(!showDebug);
                                    }}
                                    style={styles.debugToggle}
                                >
                                    <Text style={styles.debugToggleText}>
                                        {showDebug ? 'Ocultar diagnóstico técnico' : 'Mostrar diagnóstico técnico'}
                                    </Text>
                                    <MaterialCommunityIcons name={showDebug ? 'chevron-up' : 'chevron-down'} size={20} color="#4A5568" style={styles.debugChevron} accessible={false} />
                                </Pressable>

                                {showDebug && (
                                    <View style={styles.debugContainer}>
                                        <Text style={styles.debugHistoryNote}>
                                            Últimos 30 eventos · Historial temporal
                                        </Text>
                                        <Pressable
                                            accessibilityRole="button"
                                            onPress={() => setPausedLogs(pausedLogs === null ? [...logs] : null)}
                                            style={styles.debugReadingToggle}
                                        >
                                            <Text style={styles.debugToggleText}>
                                                {pausedLogs === null ? 'Pausar para leer' : 'Ver mensajes recientes'}
                                            </Text>
                                        </Pressable>
                                        {pausedLogs !== null && (
                                            <Text style={styles.debugHistoryNote}>
                                                Vista pausada; los eventos siguen llegando.
                                            </Text>
                                        )}
                                        {(pausedLogs ?? logs).length === 0 ? (
                                            <Text style={styles.debugEmptyText}>
                                                Todavía no hay eventos registrados.
                                            </Text>
                                        ) : (
                                            [...(pausedLogs ?? logs)].reverse().map(log => (
                                                <View key={log.id} style={[
                                                    styles.logEntry,
                                                    log.type === 'error'   ? styles.logEntryError :
                                                    log.type === 'warning' ? styles.logEntryWarning :
                                                    log.type === 'success' ? styles.logEntrySuccess :
                                                                             styles.logEntryInfo
                                                ]}>
                                                    <Text style={[
                                                        styles.logText,
                                                        log.type === 'error'   ? styles.logTextError :
                                                        log.type === 'warning' ? styles.logTextWarning :
                                                        log.type === 'success' ? styles.logTextSuccess :
                                                                                 styles.logTextInfo
                                                    ]}>
                                                        {log.t}
                                                    </Text>
                                                </View>
                                            ))
                                        )}
                                    </View>
                                )}
                            </View>
                        </View>
                    </>
                )}
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background,
    },
    scrollContent: {
        flexGrow: 1,
        paddingHorizontal: 24,
        paddingVertical: 24,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 12,
        fontFamily: TYPOGRAPHY.primary.medium,
        fontSize: 15,
        color: '#888',
    },
    statusSection: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        alignSelf: 'center',
        maxWidth: '100%',
        paddingHorizontal: 8,
        marginBottom: 20,
    },
    statusSectionError: {
        backgroundColor: '#FFF5F5',
        borderWidth: 1,
        borderColor: '#F5C2C0',
        borderRadius: 10,
        paddingVertical: 10,
        paddingHorizontal: 14,
    },
    statusDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        marginRight: 8,
        flexShrink: 0,
    },
    statusDotActive: {
        backgroundColor: '#2E7D32',
    },
    statusDotInactive: {
        backgroundColor: '#757575',
    },
    statusDotError: {
        backgroundColor: '#B3261E',
    },
    statusText: {
        fontFamily: TYPOGRAPHY.primary.semiBold,
        fontSize: 18,
        lineHeight: 24,
        textAlign: 'center',
        flexShrink: 1,
    },
    statusTextActive: {
        color: '#2E7D32',
    },
    statusTextInactive: {
        color: '#5F6368',
    },
    statusTextError: {
        color: '#B3261E',
    },
    infoCard: {
        backgroundColor: COLORS.background,
        borderRadius: 14,
        padding: 18,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#E8E8E8',
        elevation: 1,
        shadowColor: COLORS.shadow,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 3,
    },
    cardHeader: {
        marginBottom: 12,
        paddingBottom: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#E8E8E8',
    },
    cardTitle: {
        fontFamily: TYPOGRAPHY.primary.semiBold,
        fontSize: 15,
        color: COLORS.textTitle,
    },
    infoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        paddingVertical: 10,
    },
    infoRowStacked: {
        flexDirection: 'column',
        alignItems: 'stretch',
    },
    infoLabel: {
        flexShrink: 0,
        marginRight: 12,
        fontFamily: TYPOGRAPHY.primary.medium,
        fontSize: 13,
        lineHeight: 18,
        color: '#5F6368',
    },
    infoLabelStacked: {
        marginRight: 0,
        marginBottom: 4,
    },
    infoValue: {
        flexShrink: 1,
        textAlign: 'right',
        fontFamily: TYPOGRAPHY.primary.semiBold,
        fontSize: 15,
        lineHeight: 21,
        color: COLORS.textTitle,
    },
    infoValueStacked: {
        textAlign: 'left',
    },
    infoValueMuted: {
        color: '#5F6368',
        fontFamily: TYPOGRAPHY.primary.regular,
    },
    divider: {
        height: 1,
        backgroundColor: '#F0F0F0',
        marginVertical: 2,
    },
    errorText: {
        color: '#d32f2f',
        textAlign: 'center',
        marginBottom: 16,
        fontFamily: TYPOGRAPHY.primary.medium,
        fontSize: 13,
        lineHeight: 18,
    },
    // C4.3: Tarjeta visible cuando se agotan los reintentos de carga de asignación
    errorCard: {
        alignItems: 'center',
        marginVertical: 24,
        padding: 20,
        borderRadius: 12,
        backgroundColor: '#FFF4F4',
        borderWidth: 1,
        borderColor: '#FFCDD2',
    },
    errorTitle: {
        color: '#d32f2f',
        fontFamily: TYPOGRAPHY.primary.bold,
        fontSize: 16,
        textAlign: 'center',
        marginBottom: 8,
    },
    errorSubtitle: {
        color: '#555',
        fontFamily: TYPOGRAPHY.primary.medium,
        fontSize: 13,
        textAlign: 'center',
        lineHeight: 18,
        marginBottom: 16,
    },
    btnStart: {
        backgroundColor: COLORS.primary,
        flexDirection: 'row',
        justifyContent: 'center',
        borderRadius: 12,
        paddingVertical: 16,
        alignItems: 'center',
        marginBottom: 12,
        elevation: 2,
        shadowColor: COLORS.shadow,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 4,
    },
    btnStop: {
        backgroundColor: '#d32f2f',
        flexDirection: 'row',
        justifyContent: 'center',
        borderRadius: 12,
        paddingVertical: 16,
        alignItems: 'center',
        marginBottom: 12,
        elevation: 2,
        shadowColor: COLORS.shadow,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 4,
    },
    btnLogout: {
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: '#E8E8E8',
        flexDirection: 'row',
        justifyContent: 'center',
        borderRadius: 12,
        paddingVertical: 14,
        alignItems: 'center',
        marginBottom: 12,
    },
    btnDisabled: {
        opacity: 0.5,
    },
    btnText: {
        color: COLORS.white,
        fontFamily: TYPOGRAPHY.primary.bold,
        fontSize: 16,
    },
    btnTextStart: {
        color: '#06283D',
    },
    btnIcon: {
        marginRight: 8,
    },
    btnLogoutText: {
        color: '#4A5568',
        fontFamily: TYPOGRAPHY.primary.bold,
        fontSize: 16,
    },
    debugSection: {
        marginTop: 16,
    },
    debugCard: {
        backgroundColor: COLORS.background,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#E8E8E8',
        overflow: 'hidden',
        elevation: 1,
        shadowColor: COLORS.shadow,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 3,
    },
    debugCardHeader: {
        padding: 16,
        paddingBottom: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#F5F5F5',
    },
    debugTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 4,
    },
    debugTitle: {
        fontFamily: TYPOGRAPHY.primary.semiBold,
        fontSize: 14,
        color: COLORS.textTitle,
    },
    debugSubtitle: {
        fontFamily: TYPOGRAPHY.primary.regular,
        fontSize: 12,
        color: '#5F6368',
        lineHeight: 18,
    },
    debugToggle: {
        minHeight: 48,
        justifyContent: 'center',
        flexDirection: 'row',
        paddingVertical: 12,
        paddingHorizontal: 16,
        alignItems: 'center',
    },
    debugToggleText: {
        fontFamily: TYPOGRAPHY.primary.medium,
        fontSize: 14,
        color: '#4A5568',
    },
    debugChevron: {
        marginLeft: 6,
    },
    debugContainer: {
        paddingHorizontal: 12,
        paddingBottom: 12,
    },
    debugHistoryNote: {
        fontFamily: TYPOGRAPHY.primary.regular,
        fontSize: 12,
        lineHeight: 18,
        color: '#5F6368',
        marginBottom: 8,
    },
    debugReadingToggle: {
        minHeight: 48,
        justifyContent: 'center',
        alignItems: 'center',
    },
    debugEmptyText: {
        paddingVertical: 8,
        fontFamily: TYPOGRAPHY.primary.medium,
        fontSize: 13,
        lineHeight: 18,
        color: '#5F6368',
        textAlign: 'center',
    },
    logEntry: {
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 6,
        marginBottom: 6,
    },
    logEntryInfo: {
        backgroundColor: '#F8F9FA',
    },
    logEntrySuccess: {
        backgroundColor: '#F0FFF4',
    },
    logEntryError: {
        backgroundColor: '#FFF5F5',
    },
    logEntryWarning: {
        backgroundColor: '#FFF8E1',
    },
    logText: {
        flexShrink: 1,
        fontFamily: 'monospace',
        fontSize: 13,
        lineHeight: 18,
    },
    logTextInfo: {
        color: '#555',
    },
    logTextSuccess: {
        color: '#2E7D32',
    },
    logTextError: {
        color: '#C62828',
    },
    logTextWarning: {
        color: '#795400',
    },
});
