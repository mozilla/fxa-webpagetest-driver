/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict'

const mustache = require('mustache')
const Promise = require('bluebird')
const queries = require('./queries')
const Redshift = require('node-redshift')
const request = require('request-promise')
const WebPageTest = require('webpagetest')

const POLL_INTERVAL = 30 * 1000

const argv = process.argv
const TEST_URL = argv[2]
const URL_FORMAT = /^https?:\/\/[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}(?::[0-9]+)?\/$/
if (argv.length !== 3 || ! URL_FORMAT.test(TEST_URL)) {
  console.error(`Usage: ${argv[1]} TEST_URL`)
  console.error('TEST_URL should use an IP address so that traffic is routed locally')
  process.exit(1)
}

const env = process.env
const REQUIRED_ENV_VARS = [
  'FXA_REDSHIFT_HOST',
  'FXA_REDSHIFT_PORT',
  'FXA_REDSHIFT_DB_NAME',
  'FXA_REDSHIFT_USER',
  'FXA_REDSHIFT_PASSWORD',
  'FXA_WPT_HOST',
]
REQUIRED_ENV_VARS.forEach(key => {
  if (! env[key]) {
    console.error(`You must set $${key}`)
    process.exit(1)
  }
})

const {
  FXA_REDSHIFT_HOST: REDSHIFT_HOST,
  FXA_REDSHIFT_PORT: REDSHIFT_PORT,
  FXA_REDSHIFT_DB_NAME: REDSHIFT_DB_NAME,
  FXA_REDSHIFT_USER: REDSHIFT_USER,
  FXA_REDSHIFT_PASSWORD: REDSHIFT_PASSWORD,
  FXA_WPT_HOST: WPT_HOST,
  FXA_WPT_PORT: WPT_PORT,
  FXA_WPT_USER: WPT_USER,
  FXA_WPT_PASSWORD: WPT_PASSWORD,
  FXA_WPT_API_KEY: WPT_API_KEY
} = env

const wpt = new WebPageTest(getWptUrl(), WPT_API_KEY)
Promise.promisifyAll(wpt)

const redshift = new Redshift({
  host: REDSHIFT_HOST,
  port: REDSHIFT_PORT,
  database: REDSHIFT_DB_NAME,
  user: REDSHIFT_USER,
  password: REDSHIFT_PASSWORD
}, {
  rawConnection: true
})

let gitHash, wptLabel, wptId

request(`${TEST_URL}/__version__`)
  .then(result => {
    gitHash = JSON.parse(result).commit
    wptLabel = getWptLabel()
    return wpt.runTestAsync(TEST_URL, {
      location: 'TODO',
      connectivity: 'TODO',
      // TODO: ensure WPT is configured to allow this
      runs: 15,
      firstViewOnly: false,
      label: wptLabel
    })
  })
  .then(result => {
    wptId = result.data.id
    return getResults()
  })
  .then(result => {
    console.log(result)
    return redshift.connect()
      .then(() => redshift.query(queries.create.tests))
      .then(() => redshift.query(queries.create.runs))
      .then(() => redshift.query(mustache.render(queries.insert.tests, {
        // TODO: interpolate result data
      })))
      .then(() => redshift.query(mustache.render(queries.insert.runs, {
        // TODO: interpolate result data
      })))
  })
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })

function getWptUrl () {
  const parts = [ 'https://' ]

  if (WPT_USER && WPT_PASSWORD) {
    parts.push(`${WPT_USER}:${WPT_PASSWORD}@`)
  }

  parts.push(WPT_HOST)

  if (WPT_PORT) {
    parts.push(`:${WPT_PORT}`)
  }

  parts.push('/')

  return parts.join('')
}

function getWptLabel () {
  const now = new Date()
  const year = now.getUTCFullYear()
  const month = pad(now.getUTCMonth() + 1)
  const day = pad(now.getUTCDate())
  const hour = pad(now.getUTCHours())
  const minute = pad(now.getUTCMinutes())
  return `fxa-latest-${year}-${month}-${day}-${hour}:${minute}-${gitHash.substr(0, 7)}`
}

function pad (number) {
  if (number >= 10) {
    return number
  }

  return `0${number}`
}

function getResults () {
  return wpt.getTestResultsAsync(wptId, {
    breakDown: false,
    domains: false,
    pageSpeed: false,
    requests: false,
    medianMetric: 'SpeedIndex'
  })
    .then(result => {
      if (result.statusCode < 200) {
        return Promise.delay(POLL_INTERVAL)
          .then(getResults)
      }

      return result
    })
}

