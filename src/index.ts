enum STATE {
  VALUE,
  OPEN_OBJECT,
  PARSE_OBJECT,
  OPEN_ARRAY,
  PARSE_ARRAY,
  OPEN_KEY,
  KEY_VALUE,
  STRING,
  TRUE,
  TRUE2,
  TRUE3,
  FALSE,
  FALSE2,
  FALSE3,
  FALSE4,
  NULL,
  NULL2,
  NULL3,
  NUMBER_DECIMAL_POINT,
  NUMBER_NEGATIVE,
  NUMBER_DIGIT,
  STRING_VALUE
}

const Char = {
  tab                 : 0x09,     // \t
  lineFeed            : 0x0A,     // \n
  carriageReturn      : 0x0D,     // \r
  space               : 0x20,     // " "

  doubleQuote         : 0x22,     // "
  plus                : 0x2B,     // +
  comma               : 0x2C,     // ,
  minus               : 0x2D,     // -
  period              : 0x2E,     // .

  _0                  : 0x30,     // 0
  _9                  : 0x39,     // 9

  colon               : 0x3A,     // :

  E                   : 0x45,     // E

  openBracket         : 0x5B,     // [
  backslash           : 0x5C,     // \
  closeBracket        : 0x5D,     // ]

  a                   : 0x61,     // a
  b                   : 0x62,     // b
  e                   : 0x65,     // e 
  f                   : 0x66,     // f
  l                   : 0x6C,     // l
  n                   : 0x6E,     // n
  r                   : 0x72,     // r
  s                   : 0x73,     // s
  t                   : 0x74,     // t
  u                   : 0x75,     // u

  openBrace           : 0x7B,     // {
  closeBrace          : 0x7D,     // }
};

const stringTokenPattern = /[\\"\n]/g;

type InProgress = { key: string, val: any };

function isWhitespace(c: number) {
  return c === Char.carriageReturn || c === Char.lineFeed || c === Char.space || c === Char.tab;
}

export class MultiJSON {
  private state = STATE.VALUE;
  private state_stack: STATE[] = [];
  private value_stack: InProgress[] = [];
  private top_levels: unknown[] = [];
  private buffer = "";
  private exponent = false;
  private fraction = false;
  private slashed  = false;
  private unicodeI = 0;
  private unicodeS = "";
  private top    = -1;
  private cb?: (json: unknown) => void;

  private call(s: STATE, ret: STATE) {
    this.state_stack.push(ret);
    this.state = s;
  }

  private ret() {
    this.state = this.state_stack.pop() || STATE.VALUE;
  }

  private closevalue(value: unknown) {
    if (this.top === -1) {
      if (this.cb) this.cb(value); 
      else this.top_levels.push(value);
    } else {
      const { key, val } = this.value_stack[this.top];
      if (Array.isArray(val)) val.push(value);
      else val[key] = value;
    }

    this.ret();
  }

  private closenested() {
    const { val: obj } = this.value_stack.pop() as InProgress;
    this.top--;
    this.closevalue(obj);
  }

  public end(cb?: (json: unknown) => void) {
    let ret: unknown;
    switch(this.state) {
      case STATE.NUMBER_DIGIT:
      case STATE.NUMBER_NEGATIVE:
      case STATE.NUMBER_DECIMAL_POINT:
        ret = parseFloat(this.buffer);
        break;
      case STATE.STRING:
      case STATE.STRING_VALUE:
        ret = this.buffer;
        break;
      case STATE.TRUE:
      case STATE.TRUE2:
      case STATE.TRUE3:
        ret = true;
        break;
      case STATE.FALSE:
      case STATE.FALSE2:
      case STATE.FALSE3:
      case STATE.FALSE4:
        ret = false;
        break;
      case STATE.NULL:
      case STATE.NULL2:
      case STATE.NULL3:
        ret = null;
        break;
      case STATE.OPEN_OBJECT:
        ret = {};
        break;
      case STATE.OPEN_ARRAY:
        ret = [];
        break;
      default:
        ret = this.value_stack.pop()?.val;
    }

    while (this.value_stack.length) {
      const { key, val } = this.value_stack.pop() as InProgress;
      if (Array.isArray(val)) val.push(ret);
      else val[key] = ret;
      ret = val;
    }

    this.state = STATE.VALUE;
    this.buffer = "";
    this.fraction = false;
    this.exponent = false;
    this.top = -1;

    cb && ret && cb(ret);
    return ret;
  }

  public parse(chunk: string, cb?: (json: unknown) => void) {
    if (chunk === null) {
      if (cb) {
        this.end(cb);
        return [];
      }
      return [this.end()];
    }

    this.cb = cb;

    let i = 0;    
    char: for (;;) {
      let c = chunk.charCodeAt(i++);
      if (!c) break;
  
      if (isWhitespace(c)) continue;
      
      for (;;) switch (this.state) {
  
        case STATE.VALUE:
               if(c === Char.doubleQuote) this.call(STATE.STRING, STATE.STRING_VALUE);
          else if(c === Char.openBrace) this.state = STATE.OPEN_OBJECT;
          else if(c === Char.openBracket) this.state = STATE.OPEN_ARRAY;
          else if(c === Char.t) this.state = STATE.TRUE;
          else if(c === Char.f) this.state = STATE.FALSE;
          else if(c === Char.n) this.state = STATE.NULL;
          else if(c === Char.minus) {
            this.buffer += "-";
            this.state = STATE.NUMBER_NEGATIVE;
          } else if(c === Char._0) {
            this.buffer = '0';
            this.state = STATE.NUMBER_DECIMAL_POINT;
          } else if(Char._0 < c && c <= Char._9) {
            this.buffer += String.fromCharCode(c);
            this.state = STATE.NUMBER_DIGIT;
          } else throw new Error("Bad value");
        continue char;

        case STATE.STRING_VALUE:
          this.closevalue(this.buffer);
          this.buffer = "";
          continue;

        case STATE.OPEN_OBJECT:
          if(c === Char.closeBrace) {
            // Empty Object
            this.closevalue({});
            continue char;
          }
          
          // Open Object      
          this.value_stack.push({ key: "", val: {} });
          this.top++;

          this.state = STATE.OPEN_KEY;
          //fallthrough

        case STATE.OPEN_KEY:
          if (isWhitespace(c)) continue;
          if(c !== Char.doubleQuote)
            throw new Error("Malformed object key should start with \"");
          this.call(STATE.STRING, STATE.KEY_VALUE);
          continue char;

        case STATE.KEY_VALUE:
          this.value_stack[this.top].key = this.buffer;
          this.buffer = "";
          if (c !== Char.colon) throw new Error("Malformed object; key must be followed by colon.");
          this.call(STATE.VALUE, STATE.PARSE_OBJECT);
          continue char;

        case STATE.PARSE_OBJECT:
          if (c === Char.closeBrace) {
            this.closenested();
          } else if(c === Char.comma) {
            this.state = STATE.OPEN_KEY;
          } else {
            throw new Error('Bad object');
          }
          continue char;
        
        case STATE.OPEN_ARRAY: // after an array there always a value
          if(c === Char.closeBracket) {
            // Empty Array
            this.closevalue([]);
            continue char;
          }
          
          // Open Array
          this.value_stack.push({ key: "", val: [] });
          this.top++;

          this.call(STATE.VALUE, STATE.PARSE_ARRAY);
          if (!isWhitespace(c)) continue;
          continue char;
  
        case STATE.PARSE_ARRAY:
          if(c === Char.comma) {
            this.call(STATE.VALUE, STATE.PARSE_ARRAY);
          } else if (c === Char.closeBracket) {
            this.closenested();
          } else  throw new Error('Bad array');
          continue char;
  
        case STATE.STRING: {
          let starti = i-1;
          let slashed = this.slashed;
          let unicodeI = this.unicodeI;
          STRING_BIGLOOP: for(;;) {
            // zero means "no unicode active". 1-4 mean "parse some more". end after 4.
            while (unicodeI > 0) {
              this.unicodeS += String.fromCharCode(c);
              c = chunk.charCodeAt(i++);
              if (unicodeI === 4) {
                this.buffer += String.fromCharCode(parseInt(this.unicodeS, 16));
                unicodeI = 0;
                starti = i-1;
              } else {
                unicodeI++;
              }

              if (!c) break STRING_BIGLOOP;
            }
            if (c === Char.doubleQuote && !slashed) {
              this.buffer += chunk.substring(starti, i-1);
              this.ret();
              break;
            }
            if (c === Char.backslash && !slashed) {
              slashed = true;
              this.buffer += chunk.substring(starti, i-1);
              c = chunk.charCodeAt(i++);
              if (!c) break;
            }
            if (slashed) {
              slashed = false;
                   if (c === Char.n) { this.buffer += '\n'; }
              else if (c === Char.r) { this.buffer += '\r'; }
              else if (c === Char.t) { this.buffer += '\t'; }
              else if (c === Char.f) { this.buffer += '\f'; }
              else if (c === Char.b) { this.buffer += '\b'; }
              else if (c === Char.u) {
                // \uxxxx. meh!
                unicodeI = 1;
                this.unicodeS = '';
              } else {
                this.buffer += String.fromCharCode(c);
              }
              c = chunk.charCodeAt(i++);
              starti = i-1;
              if (!c) break;
              else continue;
            }
  
            stringTokenPattern.lastIndex = i;
            const reResult = stringTokenPattern.exec(chunk);
            if (reResult === null) {
              i = chunk.length+1;
              this.buffer += chunk.substring(starti, i-1);
              break;
            }
            i = reResult.index+1;
            c = chunk.charCodeAt(reResult.index);
            if (!c) {
              this.buffer += chunk.substring(starti, i-1);
              break;
            }
          }
          this.slashed = slashed;
          this.unicodeI = unicodeI;
          continue char;
        }
  
        case STATE.TRUE:
          if (c === Char.r) this.state = STATE.TRUE2;
          else throw new Error('Invalid true started with t'+ c);
          continue char;
  
        case STATE.TRUE2:
          if (c === Char.u) this.state = STATE.TRUE3;
          else throw new Error('Invalid true started with tr'+ c);
          continue char;
  
        case STATE.TRUE3:
          if(c === Char.e) {
            this.closevalue(true);
          } else throw new Error('Invalid true started with tru'+ c);
          continue char;
  
        case STATE.FALSE:
          if (c === Char.a) this.state = STATE.FALSE2;
          else throw new Error('Invalid false started with f'+ c);
          continue char;
  
        case STATE.FALSE2:
          if (c === Char.l) this.state = STATE.FALSE3;
          else throw new Error('Invalid false started with fa'+ c);
          continue char;
  
        case STATE.FALSE3:
          if (c === Char.s) this.state = STATE.FALSE4;
          else throw new Error('Invalid false started with fal'+ c);
          continue char;
  
        case STATE.FALSE4:
          if (c === Char.e) {
            this.closevalue(false);
          } else throw new Error('Invalid false started with fals'+ c);
          continue char;
  
        case STATE.NULL:
          if (c === Char.u) this.state = STATE.NULL2;
          else throw new Error('Invalid null started with n'+ c);
          continue char;
  
        case STATE.NULL2:
          if (c === Char.l) this.state = STATE.NULL3;
          else throw new Error('Invalid null started with nu'+ c);
          continue char;
  
        case STATE.NULL3:
          if(c === Char.l) {
            this.closevalue(null);
          } else throw new Error('Invalid null started with nul'+ c);
          continue char;
  
        case STATE.NUMBER_NEGATIVE:
          this.state = (c === Char._0) ?
            STATE.NUMBER_DECIMAL_POINT:
            STATE.NUMBER_DIGIT;
          continue;

        case STATE.NUMBER_DECIMAL_POINT:
          if(c === Char._0) {
            this.buffer += "0";
            this.state       = STATE.NUMBER_DECIMAL_POINT;
          } else {
            this.state = STATE.NUMBER_DIGIT;
            continue;
          }
          continue char;
  
        case STATE.NUMBER_DIGIT:
          if(Char._0 <= c && c <= Char._9) this.buffer += String.fromCharCode(c);
          else if (c === Char.period) {
            if(this.fraction) throw new Error('Invalid number has two dots');
            this.buffer += ".";
            this.fraction = true;
          } else if (c === Char.e || c === Char.E) {
            if(this.exponent) throw new Error('Invalid number has two exponential');
            this.buffer += "e";
            this.exponent = true;
          } else if (c === Char.plus || c === Char.minus) {
            if(!this.exponent) throw new Error('Invalid symbol in number');
            this.buffer += String.fromCharCode(c);
          } else {
            this.closevalue(parseFloat(this.buffer));
            this.buffer = "";
            this.exponent = false;
            this.fraction = false;
            continue;
          }
          continue char;
  
        default:
          throw new Error("Unknown state: " + STATE[this.state]);
      }
    }

    const { top_levels } = this;
    this.top_levels = [];
    return top_levels;
  }
}