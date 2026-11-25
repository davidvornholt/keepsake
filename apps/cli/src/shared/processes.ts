import process from 'node:process';
import { Effect } from 'effect';

/** Whether a process is running; one of another user counts too. */
export const isRunning = (pid: number) =>
  Effect.try({
    try: () => process.kill(pid, 0),
    catch: (error) => error as NodeJS.ErrnoException,
  }).pipe(
    Effect.as(true),
    Effect.catch((error) => Effect.succeed(error.code === 'EPERM')),
  );
