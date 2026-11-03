import { firebaseAuth, firebaseDatabase } from "../../../shared/config/firebase";
import { BurritoLocation } from "../types";
import database from '@react-native-firebase/database';

interface FeedbackData {
  username: string;
  avatar:   string;
  rating:   number;
  mensaje:  string;
  uid:      string;   
  email:    string;  
}

const BUSES_LOCATION_PATH = '/ubicacion_buses';
const FEEDBACK_PATH = '/comentarios';

// I06-B: margen de reloj autorizado para el MVP. La latencia de red envejece
// la publicación; no justifica fechas adelantadas más de cinco minutos.
export const MAX_FUTURE_TIMESTAMP_SKEW_MS = 300_000;

const isAbsent = (value: unknown): boolean =>
    value === undefined || value === null;

const isFiniteNumber = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value);

const isCoordinateInRange = (value: unknown, min: number, max: number): boolean =>
    isAbsent(value) || (isFiniteNumber(value) && value >= min && value <= max);

const isValidTimestamp = (value: unknown, receivedAt: number): boolean =>
    isAbsent(value)
    || (isFiniteNumber(value) && Number.isInteger(value) && value > 0
        && value <= receivedAt + MAX_FUTURE_TIMESTAMP_SKEW_MS);

const isValidIsActive = (value: unknown): boolean =>
    isAbsent(value) || typeof value === 'boolean';

const isLocationEntry = (entry: unknown, receivedAt: number): entry is Record<string, unknown> => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
        return false;
    }

    const candidate = entry as Record<string, unknown>;
    if (!isValidIsActive(candidate.isActive) || !isValidTimestamp(candidate.timestamp, receivedAt)) {
        return false;
    }

    if (candidate.isActive === false) return true;

    return isCoordinateInRange(candidate.latitude, -90, 90)
        && isCoordinateInRange(candidate.longitude, -180, 180);
};

const normalizeCoordinate = (value: unknown, min: number, max: number): number =>
    isFiniteNumber(value) && value >= min && value <= max ? value : 0;

const hasValidCoordinates = (entry: Record<string, unknown>): boolean =>
    isFiniteNumber(entry.latitude)
    && entry.latitude >= -90
    && entry.latitude <= 90
    && isFiniteNumber(entry.longitude)
    && entry.longitude >= -180
    && entry.longitude <= 180;

const normalizeTimestamp = (value: unknown): number =>
    isFiniteNumber(value) ? value : Date.now();

export const MapService = {

    subscribeToBusLocations: (
        onUpdate: (locations: Record<string, BurritoLocation>) => void,
        onError?: (error: Error) => void,
    ) => {
        const ref = firebaseDatabase.ref(BUSES_LOCATION_PATH);

        const onValueChange = ref.on('value', (snapshot) => {
            const data = snapshot.val() ?? {};
            const receivedAt = Date.now();

            const locations: Record<string, BurritoLocation> = {};
            Object.keys(data).forEach((placa) => {
                const entry = data[placa];
                if (!isLocationEntry(entry, receivedAt)) return;
                const isStop = entry.isActive === false;
                const location: BurritoLocation = {
                    latitude: normalizeCoordinate(entry.latitude, -90, 90),
                    longitude: normalizeCoordinate(entry.longitude, -180, 180),
                    heading: (entry.heading ?? 0) as number,
                    isActive: entry.isActive === true,
                    timestamp: normalizeTimestamp(entry.timestamp),
                    speed: (entry.speed ?? 0) as number,
                };
                if (isStop && !hasValidCoordinates(entry)) {
                    location.coordinatesValid = false;
                }
                locations[placa] = location;
            });

            onUpdate(locations);
        }, onError);

        return () => ref.off('value', onValueChange);
    },

    sendFeedback: async (data: FeedbackData) => {
        const currentUser = firebaseAuth.currentUser;
        if (!currentUser?.uid || currentUser.uid !== data.uid) {
            return false;
        }

        try {
            const feedbackRef = firebaseDatabase.ref(FEEDBACK_PATH).push();
            
            await feedbackRef.set({
                ...data,
                uid: currentUser.uid,
                timestamp: database.ServerValue.TIMESTAMP, 
            });
            
            return true;
        } catch (error) {
            console.error('Error al enviar feedback:', error);
            return false;
        }
    }
};
