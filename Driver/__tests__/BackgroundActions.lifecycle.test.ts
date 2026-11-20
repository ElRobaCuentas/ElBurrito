// I07, Paso 0: caracterización, no corrección. Se ejecuta el wrapper instalado.
// El preset omite su transformación: al ejecutar Jest se incluye expresamente
// react-native-background-actions en --transformIgnorePatterns, sin cambiar config.
type BackgroundJobType = typeof import('react-native-background-actions').default;
type HeadlessTask = () => Promise<void>;

const mockFactories = new Map<string, () => HeadlessTask>();
const mockRegisterHeadlessTask = jest.fn(
  (name: string, factory: () => HeadlessTask) => mockFactories.set(name, factory),
);
const mockNative = {
  start: jest.fn<Promise<void>, [{taskName: string}]>(),
  stop: jest.fn<Promise<void>, []>(),
};
const mockAddListener = jest.fn();

// Solo las superficies de React Native que utiliza la biblioteca son simuladas.
// index.js, RNBackgroundActionsModule.js y eventemitter3 son implementaciones reales.
jest.mock('react-native', () => ({
  Platform: {OS: 'android'},
  AppRegistry: {registerHeadlessTask: mockRegisterHeadlessTask},
  NativeModules: {RNBackgroundActions: mockNative},
  NativeEventEmitter: class {
    addListener = mockAddListener;
  },
}));

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return {promise, resolve};
};

const observe = (promise: Promise<void>) => {
  const settled = jest.fn();
  promise.then(settled);
  return settled;
};

// Vacía continuaciones JS; no simula tiempos ni finalización de Android.
const flushMicrotasks = async () => {
  for (let i = 0; i < 4; i++) {
    await Promise.resolve();
  }
};

const options = {
  taskName: 'BurritoTracker',
  taskTitle: 'Prueba sintética I07',
  taskDesc: 'Caracterización del wrapper',
  taskIcon: {name: 'ic_launcher', type: 'mipmap'},
};

describe('I07: ciclo real del wrapper BackgroundJob 4.1.0 (Android simulado)', () => {
  let backgroundJob: BackgroundJobType;

  beforeEach(() => {
    mockFactories.clear();
    mockRegisterHeadlessTask.mockClear();
    mockAddListener.mockClear();
    mockNative.start.mockReset().mockResolvedValue(undefined);
    mockNative.stop.mockReset().mockResolvedValue(undefined);
    // Cada caso recibe el singleton real, nuevo y sin estado de otros casos.
    jest.isolateModules(() => {
      backgroundJob = jest.requireActual('react-native-background-actions').default;
    });
  });

  const start = async (task: HeadlessTask) => {
    await backgroundJob.start(task, options);
    const calls = mockNative.start.mock.calls;
    return calls[calls.length - 1][0].taskName;
  };

  const invoke = (name: string) => {
    const factory = mockFactories.get(name);
    if (!factory) { throw new Error(`HeadlessTask no registrada: ${name}`); }
    return factory()();
  };

  it('al terminar normalmente la tarea solicita stop nativo y termina su envoltura', async () => {
    const user = deferred();
    const task = jest.fn(() => user.promise);
    const name = await start(task);
    expect(name).toBe('BurritoTracker1');
    expect(task).not.toHaveBeenCalled();
    expect(backgroundJob.isRunning()).toBe(true);

    const headless = invoke(name);
    expect(task).toHaveBeenCalledTimes(1);
    expect(mockNative.stop).not.toHaveBeenCalled();
    user.resolve();
    await headless;
    await flushMicrotasks();

    expect(mockNative.stop).toHaveBeenCalledTimes(1);
    expect(backgroundJob.isRunning()).toBe(false);
  });

  it('la finalización de A después de detener A e iniciar B vuelve a parar y resuelve B', async () => {
    const userA = deferred();
    const headlessA = invoke(await start(() => userA.promise));
    await backgroundJob.stop();
    await headlessA;

    const userB = deferred();
    const userBFinished = observe(userB.promise);
    const headlessB = invoke(await start(() => userB.promise));
    expect(backgroundJob.isRunning()).toBe(true);
    expect(mockNative.stop).toHaveBeenCalledTimes(1);

    userA.resolve();
    await headlessB;
    await flushMicrotasks();

    expect(mockNative.stop).toHaveBeenCalledTimes(2);
    expect(backgroundJob.isRunning()).toBe(false);
    expect(userBFinished).not.toHaveBeenCalled();
  });

  it('stop pendiente resuelve la envoltura antes del nativo y su respuesta pisa isRunning de B', async () => {
    const userA = deferred();
    const headlessA = invoke(await start(() => userA.promise));
    const nativeStop = deferred();
    mockNative.stop.mockReturnValueOnce(nativeStop.promise);

    const stoppingA = backgroundJob.stop();
    await headlessA;
    expect(backgroundJob.isRunning()).toBe(true);

    const userB = deferred();
    const headlessBFinished = observe(invoke(await start(() => userB.promise)));
    expect(mockNative.start).toHaveBeenCalledTimes(2);
    nativeStop.resolve();
    await stoppingA;
    await flushMicrotasks();

    expect(backgroundJob.isRunning()).toBe(false);
    expect(headlessBFinished).not.toHaveBeenCalled();
    // Solo caracteriza el flag JS: no afirma cuándo Android destruye el servicio.
    await backgroundJob.stop();
  });

  it('stop explícito termina la envoltura con usuario pendiente, pero no limpia sus temporizadores', async () => {
    jest.useFakeTimers();
    const pulse = jest.fn();
    const user = deferred();
    const userFinished = observe(user.promise);
    let timer: ReturnType<typeof setInterval> | undefined;
    try {
      const name = await start(() => {
        timer = setInterval(pulse, 8000);
        return user.promise;
      });
      const headless = invoke(name);
      await backgroundJob.stop();
      await headless;
      await jest.advanceTimersByTimeAsync(16000);

      expect(backgroundJob.isRunning()).toBe(false);
      expect(userFinished).not.toHaveBeenCalled();
      expect(mockNative.stop).toHaveBeenCalledTimes(1);
      expect(pulse).toHaveBeenCalledTimes(2);
      expect(jest.getTimerCount()).toBe(1);
      if (timer === undefined) { throw new Error('Temporizador de prueba no creado'); }
      clearInterval(timer);
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      if (timer !== undefined) { clearInterval(timer); }
      jest.useRealTimers();
    }
  });

  it('una invocación HeadlessJS posterior a stop todavía ejecuta la tarea de usuario', async () => {
    const user = deferred();
    const task = jest.fn(() => user.promise);
    const name = await start(task);
    await backgroundJob.stop();
    expect(backgroundJob.isRunning()).toBe(false);
    expect(task).not.toHaveBeenCalled();

    const headless = invoke(name);
    const headlessFinished = observe(headless);
    await flushMicrotasks();
    expect(task).toHaveBeenCalledTimes(1);
    expect(headlessFinished).not.toHaveBeenCalled();
    expect(backgroundJob.isRunning()).toBe(false);

    await backgroundJob.stop();
    await headless;
  });

  it('A invocada tarde reemplaza el resolver: stop termina A pero deja la envoltura de B pendiente', async () => {
    const userA = deferred();
    const nameA = await start(() => userA.promise);
    await backgroundJob.stop();

    const userB = deferred();
    const headlessBFinished = observe(invoke(await start(() => userB.promise)));
    const headlessA = invoke(nameA);
    await backgroundJob.stop();
    await headlessA;
    await flushMicrotasks();

    expect(backgroundJob.isRunning()).toBe(false);
    expect(headlessBFinished).not.toHaveBeenCalled();
    // Repetir stop no recupera el resolver de B: quedó reemplazado por el de A.
    await backgroundJob.stop();
    await flushMicrotasks();
    expect(headlessBFinished).not.toHaveBeenCalled();
    expect(mockNative.stop).toHaveBeenCalledTimes(3);
  });

  it('el fin normal de la envoltura no garantiza que su stop automático nativo haya terminado', async () => {
    const userA = deferred();
    const headlessA = invoke(await start(() => userA.promise));
    const nativeStop = deferred();
    mockNative.stop.mockReturnValueOnce(nativeStop.promise);
    userA.resolve();
    await headlessA;

    expect(mockNative.stop).toHaveBeenCalledTimes(1);
    expect(backgroundJob.isRunning()).toBe(true);
    const userB = deferred();
    const headlessBFinished = observe(invoke(await start(() => userB.promise)));
    nativeStop.resolve();
    await flushMicrotasks();

    expect(backgroundJob.isRunning()).toBe(false);
    expect(headlessBFinished).not.toHaveBeenCalled();
    await backgroundJob.stop();
  });

  it('esperar stop público antes de iniciar B evita que la respuesta pendiente de A pise el flag de B', async () => {
    // Condición delimitada: A ya entró; su promesa de usuario no resolverá tarde.
    const userA = deferred();
    const headlessA = invoke(await start(() => userA.promise));
    const nativeStop = deferred();
    mockNative.stop.mockReturnValueOnce(nativeStop.promise);
    const userB = deferred();
    const stoppingA = backgroundJob.stop();
    const startBWhenStopped = (async () => {
      await stoppingA;
      return start(() => userB.promise);
    })();

    await headlessA;
    await flushMicrotasks();
    expect(mockNative.start).toHaveBeenCalledTimes(1);
    expect(backgroundJob.isRunning()).toBe(true);
    nativeStop.resolve();
    const headlessB = invoke(await startBWhenStopped);
    await flushMicrotasks();

    expect(mockNative.start).toHaveBeenCalledTimes(2);
    expect(mockNative.stop).toHaveBeenCalledTimes(1);
    expect(backgroundJob.isRunning()).toBe(true);
    await backgroundJob.stop();
    await headlessB;
    expect(backgroundJob.isRunning()).toBe(false);
  });

  it('incluso en orden A→B, retornar resuelto al descartar A tardía provoca stop de B', async () => {
    let cancelledA = false;
    const userA = deferred();
    const acquireA = jest.fn();
    const nameA = await start(() => {
      if (cancelledA) { return Promise.resolve(); }
      acquireA();
      return userA.promise;
    });
    cancelledA = true;
    await backgroundJob.stop();

    const userB = deferred();
    const nameB = await start(() => userB.promise);
    // Entrega A antes de B, sin invertir el orden de registros. Sigue siendo
    // entrega controlada del test, no una reproducción del planificador Android.
    const headlessA = invoke(nameA);
    const headlessAFinished = observe(headlessA);
    const headlessB = invoke(nameB);
    await headlessB;
    await flushMicrotasks();

    expect(acquireA).not.toHaveBeenCalled();
    expect(mockNative.stop).toHaveBeenCalledTimes(2);
    expect(backgroundJob.isRunning()).toBe(false);
    expect(headlessAFinished).not.toHaveBeenCalled();
  });

  it('mantener A tardía pendiente evita su stop automático, pero stop de B no termina la envoltura de A', async () => {
    const userA = deferred();
    const nameA = await start(() => userA.promise);
    await backgroundJob.stop();

    const userB = deferred();
    const nameB = await start(() => userB.promise);
    const headlessAFinished = observe(invoke(nameA));
    const headlessB = invoke(nameB);
    await flushMicrotasks();
    expect(mockNative.stop).toHaveBeenCalledTimes(1);
    expect(backgroundJob.isRunning()).toBe(true);

    await backgroundJob.stop();
    await headlessB;
    await flushMicrotasks();
    expect(mockNative.stop).toHaveBeenCalledTimes(2);
    expect(backgroundJob.isRunning()).toBe(false);
    expect(headlessAFinished).not.toHaveBeenCalled();
    // API pública sin handle para A: otro stop vuelve a resolver B, no A.
    await backgroundJob.stop();
    await flushMicrotasks();
    expect(headlessAFinished).not.toHaveBeenCalled();
  });
});
