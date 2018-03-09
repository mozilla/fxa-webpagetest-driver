/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict'

const REDSHIFT_TABLE_NAMES = {
  tests: 'latest_wpt_tests',
  runs: 'latest_wpt_runs'
}

const DATA_COLUMNS = [
  'first_view_first_byte',
  'first_view_start_render',
  'first_view_load',
  'first_view_speed_index',
  'first_view_fully_loaded',
  'first_view_bytes',
  'first_view_requests',
  'first_view_connections',
  'repeat_view_first_byte',
  'repeat_view_start_render',
  'repeat_view_load',
  'repeat_view_speed_index',
  'repeat_view_fully_loaded',
  'repeat_view_bytes',
  'repeat_view_requests',
  'repeat_view_connections'
]

const DATA_COLUMN_SCHEMATA = DATA_COLUMNS
  .map(c => `${c} INTEGER NOT NULL ENCODE zstd`)
  .join(',\n')

const DATA_COLUMN_NAMES = DATA_COLUMNS.join(',\n')

const DATA_COLUMN_TEMPLATES = DATA_COLUMNS
  .map(c => `{{${c.replace(/_([a-z])/g, (_, s) => s.toUpperCase())}}}`)
  .join(',\n')

module.exports = {
  create: {
    tests: `CREATE TABLE IF NOT EXISTS ${REDSHIFT_TABLE_NAMES.tests} (
      time TIMESTAMP NOT NULL SORTKEY,
      id VARCHAR(32) NOT NULL DISTKEY ENCODE zstd,
      label VARCHAR(64) NOT NULL ENCODE zstd,
      location VARCHAR(64) NOT NULL ENCODE zstd,
      browser VARCHAR(32) NOT NULL ENCODE zstd,
      connection VARCHAR(32) NOT NULL ENCODE zstd,
      runs SMALLINT NOT NULL ENCODE zstd,
      git_repo VARCHAR(64) NOT NULL ENCODE zstd,
      git_hash VARCHAR(40) NOT NULL ENCODE zstd,
      ${DATA_COLUMN_SCHEMATA}
    );`,
    runs: `CREATE TABLE IF NOT EXISTS ${REDSHIFT_TABLE_NAMES.runs} (
      test VARCHAR(32) NOT NULL SORTKEY DISTKEY ENCODE zstd,
      index SMALLINT NOT NULL ENCODE zstd,
      ${DATA_COLUMN_SCHEMATA}
    );`
  },
  insert: {
    tests: `INSERT INTO ${REDSHIFT_TABLE_NAMES.tests} (
      timestamp,
      id,
      label,
      location,
      ${DATA_COLUMN_NAMES}
    ) VALUES (
      {{timestamp}},
      {{id}},
      {{label}},
      {{location}},
      ${DATA_COLUMN_TEMPLATES}
    );`,
    runs: `INSERT INTO ${REDSHIFT_TABLE_NAMES.runs} (
      test,
      index,
      ${DATA_COLUMN_NAMES}
    ) VALUES (
      {{test}},
      {{index}},
      ${DATA_COLUMN_TEMPLATES}
    );`
  }
}

