/* eslint-disable no-console */
const fs = require('fs')
const _ = require('lodash')
const { readFromBufferP, extractSounds } = require('../dist')

const rawData = fs.readFileSync('./239e.swf');

(async () => {
  const swf = await readFromBufferP(rawData)
  const xs = _.compact(await Promise.all(extractSounds(swf.tags)))
  console.log(xs)
})()
