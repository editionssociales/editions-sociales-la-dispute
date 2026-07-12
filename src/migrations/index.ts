import * as migration_20260711_150633_initial from './20260711_150633_initial';
import * as migration_20260711_150700_slug_unique_sans_edition from './20260711_150700_slug_unique_sans_edition';
import * as migration_20260711_212222_highlight from './20260711_212222_highlight';

export const migrations = [
  {
    up: migration_20260711_150633_initial.up,
    down: migration_20260711_150633_initial.down,
    name: '20260711_150633_initial',
  },
  {
    up: migration_20260711_150700_slug_unique_sans_edition.up,
    down: migration_20260711_150700_slug_unique_sans_edition.down,
    name: '20260711_150700_slug_unique_sans_edition',
  },
  {
    up: migration_20260711_212222_highlight.up,
    down: migration_20260711_212222_highlight.down,
    name: '20260711_212222_highlight'
  },
];
