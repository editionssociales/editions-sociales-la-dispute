import * as migration_20260711_150633_initial from './20260711_150633_initial';
import * as migration_20260711_150700_slug_unique_sans_edition from './20260711_150700_slug_unique_sans_edition';
import * as migration_20260711_212222_highlight from './20260711_212222_highlight';
import * as migration_20260712_164840_commerce from './20260712_164840_commerce';
import * as migration_20260712_175030_stock_updated_at from './20260712_175030_stock_updated_at';
import * as migration_20260712_203246_order_status_failed from './20260712_203246_order_status_failed';
import * as migration_20260713_035502_sellable_par_defaut from './20260713_035502_sellable_par_defaut';
import * as migration_20260713_060544_import_runs from './20260713_060544_import_runs';
import * as migration_20260713_063159_contenus_editables from './20260713_063159_contenus_editables';
import * as migration_20260717_150000_orders_status_index from './20260717_150000_orders_status_index';

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
    name: '20260712_203246_order_status_failed',
  },
  {
    up: migration_20260713_035502_sellable_par_defaut.up,
    down: migration_20260713_035502_sellable_par_defaut.down,
    name: '20260713_035502_sellable_par_defaut',
  },
  {
    up: migration_20260713_060544_import_runs.up,
    down: migration_20260713_060544_import_runs.down,
    name: '20260713_060544_import_runs',
  },
  {
    up: migration_20260713_063159_contenus_editables.up,
    down: migration_20260713_063159_contenus_editables.down,
    name: '20260713_063159_contenus_editables'
  },
  {
    up: migration_20260717_150000_orders_status_index.up,
    down: migration_20260717_150000_orders_status_index.down,
    name: '20260717_150000_orders_status_index',
  },
];
