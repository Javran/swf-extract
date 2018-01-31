/* eslint-disable no-console */
const fs = require('fs')
const _ = require('lodash')
const { readFromBufferP, extractSounds } = require('../dist')

const rawData = fs.readFileSync('./sound_b_bgm_100.swf');

(async () => {
  const swf = await readFromBufferP(rawData)
  const xs = _.compact(await Promise.all(extractSounds(swf.tags)))
  xs.map(mp3 => fs.writeFileSync(`sound-${mp3.soundId}.mp3`, mp3.mp3Data))
})()
