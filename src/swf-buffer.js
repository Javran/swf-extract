/* eslint-disable no-bitwise */
const RECORDHEADER_LENTH_FULL = 0x3f
// null-character
const EOS = 0x00

/**
 *
 * Constructor of SWFBuffer object
 *
 * @param {Buffer} buffer
 * @return Instance of SWFBuffer
 */

class SWFBuffer {
  constructor(buffer) {
    this.buffer = buffer
    this.pointer = 0
    this.position = 1
    this.current = 0
  }

  incr(n) {
    this.pointer += n
  }

  /**
   * Reads unsigned 16 or 32 Little Endian Bits
   * and advance pointer to next bits / 8 bytes
   *
   * @param {Number} bits
   * @return {Number} Value read from buffer
   */

  readUIntLE( bits ) {
    let value = 0
    try {
      value = this.buffer[`readUInt${bits}LE`](this.pointer)
      this.pointer += bits / 8
    } catch ( e ) {
      throw e
    }
    return value
  }

  /**
   * Reads unsigned 8 bit from the buffer
   *
   * @return {Number} Value read from buffer
   */

  readUInt8() {
    return this.buffer.readUInt8( this.pointer++ )
  }

  /**
   * Reads 32-bit unsigned integers value encoded (1-5 bytes)
   *
   * @return {Number} 32-bit unsigned integer
   */
  readEncodedU32() {
    let result = this.nextByte()
    if (!(result & 0x00000080))
      return result

    result = (result & 0x0000007f) | (this.nextByte() << 7)
    if (!(result & 0x00004000))
      return result

    result = (result & 0x00003fff) | (this.nextByte() << 14)
    if (!(result & 0x00020000))
      return result

    result = (result & 0x001fffff) | (this.nextByte() << 21)
    if (!(result & 0x10000000))
      return result

    result = (result & 0x0fffffff) | (this.nextByte() << 28)
    return result
  }

  /**
   * Reads an encoded data from buffer and returns a
   * string using the specified character set.
   *
   * @param {String} encoding - defaults to 'utf8'
   * @returns {String} Decoded string
   */

  readString(encoding) {
    const init = this.pointer
    while (this.readUInt8() !== EOS);
    return this.buffer.toString(encoding || 'utf8', init, this.pointer - 1)
  }

  /**
   * Reads RGB value
   *
   * @return {Array} Array of RGB value
   */

  readRGB() {
    return [this.readUInt8(), this.readUInt8(), this.readUInt8()]
  }

  /**
   * Reads RGBA value
   *
   * @return {Array} Array of RGBA value
   */

  readRGBA() {
    const rgba = this.readRGB()
    rgba.push(this.readUInt8())
    return rgba
  }

  /**
   * Reads RECORDHEADER from next tag in the buffer
   *
   * @return {Object} Tag code and length
   */

  readTagCodeAndLength() {
    const n = this.readUIntLE(16)
    const tagType = n >> 6
    let tagLength = n & RECORDHEADER_LENTH_FULL

    if ( tagLength === RECORDHEADER_LENTH_FULL )
      tagLength = this.readUIntLE(32)

    return { code: tagType, length: tagLength }
  }

  /**
   * Reads RECT format
   *
   * @return {Object} x, y, width and height of the RECT
   */

  readRect() {
    this.start()

    const NBits = this.readBits(5)
    const Xmin = this.readBits(NBits, true)/20
    const Xmax = this.readBits(NBits, true)/20
    const Ymin = this.readBits(NBits, true)/20
    const Ymax = this.readBits(NBits, true)/20

    return {
      x: Xmin,
      y: Ymin,
      width: (Xmax > Xmin ? Xmax - Xmin : Xmin - Xmax),
      height: (Ymax > Ymin ? Ymax - Ymin : Ymin - Ymax),
    }
  }

  /**
   * Sets internal pointer to the specified position;
   *
   * @param {Number} pos
   */

  seek( pos ) {
    this.pointer = pos % this.buffer.length
  }

  /**
   * Resets position and sets current to next Byte in buffer
   */
  start() {
    this.current = this.nextByte()
    this.position = 1
  }

  /**
   * Gets next Byte in the buffer and Increment internal pointer
   *
   * @return {Number} Next byte in buffer
   */

  nextByte() {
    return this.pointer > this.buffer.length ? null : this.buffer[this.pointer++]
  }

  /**
   * Reads b bits from current byte in buffer
   *
   * @param {Number} b
   * @return {Number} Bits read from buffer
   */

  readBits( b, signed ) {
    let n = 0
    let r = 0
    const sign = signed && ++n && ((this.current >> (8-this.position++)) & 1) ? -1 : 1

    while ( n++ < b ) {
      if ( this.position > 8 ) this.start()

      r = (r << 1 ) + ((this.current >> (8-this.position++)) & 1)
    }
    return sign * r
  }
}

export { SWFBuffer }
