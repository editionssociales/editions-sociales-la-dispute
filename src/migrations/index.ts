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
import * as migration_20260719_074211_highlight_couleur_cta from './20260719_074211_highlight_couleur_cta';
import * as migration_20260719_105000_libelles from './20260719_105000_libelles';
import * as migration_20260720_004500_pages_absorb_reglages_site from './20260720_004500_pages_absorb_reglages_site';
import * as migration_20260722_223000_rencontres from './20260722_223000_rencontres';
import * as migration_20260724_120000_fiche_presse_video_tdm from './20260724_120000_fiche_presse_video_tdm';
import * as migration_20260724_121000_rencontres_plein_cadre from './20260724_121000_rencontres_plein_cadre';
import * as migration_20260724_141654_souscription_2026 from './20260724_141654_souscription_2026';
import * as migration_20260726_150000_commande_marqueurs_effets from './20260726_150000_commande_marqueurs_effets';
import * as migration_20260817_120000_footer_sans_texte_diffusion from './20260817_120000_footer_sans_texte_diffusion';
import * as migration_20260820_140000_precommande from './20260820_140000_precommande';
import * as migration_20260821_090000_don_ordertype from './20260821_090000_don_ordertype';

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
    name: '20260713_063159_contenus_editables',
  },
  {
    up: migration_20260717_150000_orders_status_index.up,
    down: migration_20260717_150000_orders_status_index.down,
    name: '20260717_150000_orders_status_index',
  },
  {
    up: migration_20260719_074211_highlight_couleur_cta.up,
    down: migration_20260719_074211_highlight_couleur_cta.down,
    name: '20260719_074211_highlight_couleur_cta'
  },
  {
    up: migration_20260719_105000_libelles.up,
    down: migration_20260719_105000_libelles.down,
    name: '20260719_105000_libelles',
  },
  {
    up: migration_20260720_004500_pages_absorb_reglages_site.up,
    down: migration_20260720_004500_pages_absorb_reglages_site.down,
    name: '20260720_004500_pages_absorb_reglages_site',
  },
  {
    up: migration_20260722_223000_rencontres.up,
    down: migration_20260722_223000_rencontres.down,
    name: '20260722_223000_rencontres',
  },
  {
    up: migration_20260724_120000_fiche_presse_video_tdm.up,
    down: migration_20260724_120000_fiche_presse_video_tdm.down,
    name: '20260724_120000_fiche_presse_video_tdm',
  },
  {
    up: migration_20260724_121000_rencontres_plein_cadre.up,
    down: migration_20260724_121000_rencontres_plein_cadre.down,
    name: '20260724_121000_rencontres_plein_cadre',
  },
  {
    up: migration_20260724_141654_souscription_2026.up,
    down: migration_20260724_141654_souscription_2026.down,
    name: '20260724_141654_souscription_2026',
  },
  {
    up: migration_20260726_150000_commande_marqueurs_effets.up,
    down: migration_20260726_150000_commande_marqueurs_effets.down,
    name: '20260726_150000_commande_marqueurs_effets',
  },
  {
    up: migration_20260817_120000_footer_sans_texte_diffusion.up,
    down: migration_20260817_120000_footer_sans_texte_diffusion.down,
    name: '20260817_120000_footer_sans_texte_diffusion',
  },
  {
    up: migration_20260820_140000_precommande.up,
    down: migration_20260820_140000_precommande.down,
    name: '20260820_140000_precommande',
  },
  {
    up: migration_20260821_090000_don_ordertype.up,
    down: migration_20260821_090000_don_ordertype.down,
    name: '20260821_090000_don_ordertype',
  },
];
