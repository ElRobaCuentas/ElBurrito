// Pipeline real de recepción: solo se simula el transporte Firebase.
jest.mock('../src/shared/config/firebase', () => {
  const ref = {
    on: jest.fn((...args: unknown[]) => args[1]),
    off: jest.fn(),
  };
  return { firebaseDatabase: { ref: jest.fn(() => ref) } };
});

jest.mock('@react-native-firebase/database', () => ({
  __esModule: true,
  default: { ServerValue: { TIMESTAMP: 0 } },
}));

import { firebaseDatabase } from '../src/shared/config/firebase';
import { useBurritoStore } from '../src/store/burritoLocationStore';

describe('I06-B: MapService → store sin envenenar el filtro temporal', () => {
  const now = 1_800_000_000_000;
  const validEntry = { latitude: -12.05, longitude: -77.08, isActive: true, timestamp: now };
  let receive: (snapshot: { val: () => unknown }) => void;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(now);
    useBurritoStore.getState().actions.stopTracking();
    jest.clearAllMocks();
    useBurritoStore.getState().actions.startTracking();
    const ref = (firebaseDatabase.ref as jest.Mock).mock.results[0].value;
    receive = ref.on.mock.calls[0][1];
  });

  afterEach(() => {
    useBurritoStore.getState().actions.stopTracking();
    jest.useRealTimers();
  });

  test('un primer timestamp de mañana no bloquea la ubicación normal posterior', () => {
    receive({ val: () => ({ 'ABC-123': { ...validEntry, timestamp: now + 86_400_000 } }) });
    expect(useBurritoStore.getState().locations['ABC-123']).toBeUndefined();

    receive({ val: () => ({ 'ABC-123': validEntry }) });
    expect(useBurritoStore.getState().locations['ABC-123']).toEqual(expect.objectContaining(validEntry));
    expect(useBurritoStore.getState().busMovementStates['ABC-123']).toBe('moving');
  });

  test('conserva la última ubicación ante la fecha futura y acepta la siguiente válida', () => {
    receive({ val: () => ({ 'ABC-123': { ...validEntry, timestamp: now - 1_000 } }) });
    const previous = useBurritoStore.getState().locations['ABC-123'];
    receive({ val: () => ({ 'ABC-123': { ...validEntry, latitude: -12.06, timestamp: now + 86_400_000 } }) });
    expect(useBurritoStore.getState().locations['ABC-123']).toEqual(previous);

    receive({ val: () => ({ 'ABC-123': { ...validEntry, latitude: -12.07 } }) });
    expect(useBurritoStore.getState().locations['ABC-123']).toEqual(
      expect.objectContaining({ latitude: -12.07, timestamp: now }),
    );
  });
});
