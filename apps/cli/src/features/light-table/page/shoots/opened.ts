// The album that was opened last, so that the keyboard is on it again when
// the owner comes back to the shelf.

let opened: string | null = null;

export const noteOpened = (shoot: string | null): void => {
  opened = shoot;
};

export const lastOpened = (): string | null => opened;
