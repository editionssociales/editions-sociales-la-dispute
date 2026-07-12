import * as migration_20260711_150633_initial from './20260711_150633_initial';
import * as migration_20260711_150700_slug_unique_sans_edition from './20260711_150700_slug_unique_sans_edition';
import * as migration_20260711_212222_highlight from './20260711_212222_highlight';
import * as migration_20260712_164840_commerce from './20260712_164840_commerce';
import * as migration_20260712_175030_stock_updated_at from './20260712_175030_stock_updated_at';
import * as migration_20260712_203246_order_status_failed from './20260712_203246_order_status_failed';

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
    name: '20260711_212222_highlight',
  },
  {
    up: migration_20260712_164840_commerce.up,
    down: migration_20260712_164840_commerce.down,
    name: '20260712_164840_commerce',
  },
  {
    up: migration_20260712_175030_stock_updated_at.up,
    down: migration_20260712_175030_stock_updated_at.down,
    name: '20260712_175030_stock_updated_at',
  },
  {
    up: migration_20260712_203246_order_status_failed.up,
    down: migration_20260712_203246_order_status_failed.down,
    name: '20260712_203246_order_status_failed'
  },
];
