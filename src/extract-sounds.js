import { SwfTags } from './swf-tags'
import { tagReaders } from './tag-readers'

const extractSounds = rawTags =>
  rawTags.filter(
    t => t.code === SwfTags.DefineSound
  ).map(rawTag => new Promise(resolve => {
    const data = tagReaders[SwfTags.DefineSound](rawTag.rawData)
    if (data.soundFormat !== 2) {
      return resolve(null)
    }

    resolve({
      type: 'mp3',
      soundId: data.soundId,
      /*
         not sure what these 2 skipped bytes are for, but ffdec seems to always
         ignore them for MP3 format
       */
      mp3Data: data.soundData.slice(2),
    })
  }))

export { extractSounds }
